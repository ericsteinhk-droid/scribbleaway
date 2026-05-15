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

    // If startRecording() is called before onServiceConnected fires, we store
    // the meetingId here and start recording the moment the service connects.
    private var pendingStartMeetingId = -1L

    private val _recordingState = MutableStateFlow(RecordingState.IDLE)
    val recordingState: StateFlow<RecordingState> = _recordingState.asStateFlow()

    private val _elapsedSeconds = MutableStateFlow(0L)
    val elapsedSeconds: StateFlow<Long> = _elapsedSeconds.asStateFlow()

    private val _chunkCount = MutableStateFlow(0)
    val chunkCount: StateFlow<Int> = _chunkCount.asStateFlow()

    private val _meetingId = MutableStateFlow(-1L)

    private val _navigateToPreview = MutableStateFlow(-1L)
    val navigateToPreview: StateFlow<Long> = _navigateToPreview.asStateFlow()

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            val svc = (binder as RecordingService.RecordingBinder).getService()
            service = svc

            // Bridge service StateFlows into our own so the fragment observes one source
            viewModelScope.launch { svc.state.collect { _recordingState.value = it } }
            viewModelScope.launch { svc.elapsedSeconds.collect { _elapsedSeconds.value = it } }
            viewModelScope.launch { svc.chunkCount.collect { _chunkCount.value = it } }

            // If the user tapped Record before the bind completed, start now
            if (pendingStartMeetingId > 0) {
                svc.startRecording(pendingStartMeetingId, prefs.chunkDurationMinutes)
                pendingStartMeetingId = -1L
            }
        }

        override fun onServiceDisconnected(name: ComponentName) {
            service = null
        }
    }

    fun bindService() {
        val intent = Intent(getApplication(), RecordingService::class.java)
        getApplication<Application>().bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    fun unbindService() {
        runCatching { getApplication<Application>().unbindService(connection) }
        service = null
    }

    fun startRecording() {
        viewModelScope.launch {
            val df = SimpleDateFormat("d MMM yyyy, HH:mm", Locale.CANADA_FRENCH)
            val title = "${prefs.meetingTitleTemplate} — ${df.format(Date())}"
            val meetingId = repo.createMeeting(title)
            _meetingId.value = meetingId

            getApplication<Application>().startForegroundService(
                Intent(getApplication(), RecordingService::class.java)
            )

            val svc = service
            if (svc != null) {
                svc.startRecording(meetingId, prefs.chunkDurationMinutes)
            } else {
                // onServiceConnected will pick this up and start recording
                pendingStartMeetingId = meetingId
            }
        }
    }

    fun pauseRecording() = service?.pauseRecording()

    fun resumeRecording() = service?.resumeRecording()

    fun stopRecording() {
        val meetingId = _meetingId.value
        if (meetingId < 0) return
        val chunks = service?.stopRecording() ?: return

        viewModelScope.launch {
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
