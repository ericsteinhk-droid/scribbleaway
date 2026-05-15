package com.scribbleaway.meetingrecorder.ui.record

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.scribbleaway.meetingrecorder.App
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.prefs.AppPreferences
import com.scribbleaway.meetingrecorder.service.RecordingService
import com.scribbleaway.meetingrecorder.service.RecordingState
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class RecordViewModel(app: Application) : AndroidViewModel(app) {

    private val prefs = AppPreferences(app)
    private val repo = (app as App).meetingRepository

    private var service: RecordingService? = null
    private val _serviceReady = MutableStateFlow(false)

    val recordingState: StateFlow<RecordingState> = _serviceReady
        .flatMapLatest { ready ->
            if (ready) service!!.state else flowOf(RecordingState.IDLE)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, RecordingState.IDLE)

    val elapsedSeconds: StateFlow<Long> = _serviceReady
        .flatMapLatest { ready ->
            if (ready) service!!.elapsedSeconds else flowOf(0L)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, 0L)

    val chunkCount: StateFlow<Int> = _serviceReady
        .flatMapLatest { ready ->
            if (ready) service!!.chunkCount else flowOf(0)
        }.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    private val _meetingId = MutableStateFlow(-1L)

    // Emits the meetingId once stop+save is fully complete; PreviewFragment observes this
    private val _navigateToPreview = MutableStateFlow(-1L)
    val navigateToPreview: StateFlow<Long> = _navigateToPreview.asStateFlow()

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = (binder as RecordingService.RecordingBinder).getService()
            _serviceReady.value = true
        }
        override fun onServiceDisconnected(name: ComponentName) {
            _serviceReady.value = false
            service = null
        }
    }

    fun bindService() {
        val intent = Intent(getApplication(), RecordingService::class.java)
        getApplication<Application>().bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    fun unbindService() {
        runCatching { getApplication<Application>().unbindService(connection) }
    }

    fun startRecording() {
        viewModelScope.launch {
            val df = SimpleDateFormat("d MMM yyyy, HH:mm", Locale.CANADA_FRENCH)
            val title = "${prefs.meetingTitleTemplate} — ${df.format(Date())}"
            val meetingId = repo.createMeeting(title)
            _meetingId.value = meetingId
            val intent = Intent(getApplication(), RecordingService::class.java)
            getApplication<Application>().startForegroundService(intent)
            service?.startRecording(meetingId, prefs.chunkDurationMinutes)
        }
    }

    fun pauseRecording() = service?.pauseRecording()

    fun resumeRecording() = service?.resumeRecording()

    fun stopRecording() {
        val meetingId = _meetingId.value
        if (meetingId < 0) return
        val chunks = service?.stopRecording() ?: return

        viewModelScope.launch {
            // The final (non-rotated) chunk is the last one returned; rotated chunks are
            // already persisted via the onChunkReady callback in RecordingService.
            if (chunks.isNotEmpty()) {
                val last = chunks.last()
                runCatching {
                    repo.savePendingChunk(
                        meetingId,
                        Chunk(
                            meetingId = meetingId,
                            index = last.index,
                            filePath = last.file.absolutePath,
                            offsetSeconds = last.offsetSeconds,
                            durationSeconds = 0.0
                        )
                    )
                }
            }
            _navigateToPreview.value = meetingId
        }
    }

    fun onNavigatedToPreview() { _navigateToPreview.value = -1L }

    fun hasApiKey(): Boolean = prefs.openAiApiKey.isNotBlank()

    override fun onCleared() {
        super.onCleared()
        unbindService()
    }
}
