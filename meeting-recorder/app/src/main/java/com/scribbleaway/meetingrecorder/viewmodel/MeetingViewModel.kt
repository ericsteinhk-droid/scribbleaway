package com.scribbleaway.meetingrecorder.viewmodel

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.scribbleaway.meetingrecorder.data.MeetingDatabase
import com.scribbleaway.meetingrecorder.data.MeetingEntity
import com.scribbleaway.meetingrecorder.data.SettingsRepository
import com.scribbleaway.meetingrecorder.minutes.MinutesGenerator
import com.scribbleaway.meetingrecorder.service.RecordingService
import com.scribbleaway.meetingrecorder.transcription.TranscriptionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

enum class RecordingState {
    IDLE, RECORDING, PAUSED, STOPPED
}

data class MeetingUiState(
    val recordingState: RecordingState = RecordingState.IDLE,
    val durationSeconds: Long = 0L,
    val transcript: String = "",
    val partialText: String = "",
    val meetingMinutes: String = "",
    val isGeneratingMinutes: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val savedAudioPath: String = "",
    val savedTranscriptPath: String = "",
    val participantCount: Int = 8,
    val contextText: String = "",
    val contextFileName: String = "",
    val isListening: Boolean = false,
    val savedMeetingId: Long = -1L
)

class MeetingViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(MeetingUiState())
    val uiState: StateFlow<MeetingUiState> = _uiState.asStateFlow()

    private val transcriptionManager = TranscriptionManager(application)
    private val minutesGenerator = MinutesGenerator()
    private val db = MeetingDatabase.getInstance(application)
    private val settings = SettingsRepository.getInstance(application)

    val allMeetings = db.meetingDao().getAllMeetings()
    val claudeApiKey = settings.claudeApiKey

    private var currentAudioPath = ""
    private var meetingStartTime = 0L

    private val durationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val secs = intent?.getLongExtra(RecordingService.EXTRA_DURATION_SECONDS, 0L) ?: 0L
            _uiState.update { it.copy(durationSeconds = secs) }
        }
    }

    init {
        // Bridge TranscriptionManager flows into UI state
        viewModelScope.launch {
            transcriptionManager.transcript.collect { text ->
                _uiState.update { it.copy(transcript = text) }
            }
        }
        viewModelScope.launch {
            transcriptionManager.partialText.collect { partial ->
                _uiState.update { it.copy(partialText = partial) }
            }
        }
        viewModelScope.launch {
            transcriptionManager.isListening.collect { listening ->
                _uiState.update { it.copy(isListening = listening) }
            }
        }
        viewModelScope.launch {
            transcriptionManager.error.collect { err ->
                if (err != null) _uiState.update { it.copy(error = err) }
            }
        }

        // Register duration receiver
        val filter = IntentFilter(RecordingService.BROADCAST_DURATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            application.registerReceiver(durationReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            application.registerReceiver(durationReceiver, filter)
        }
    }

    fun setParticipantCount(count: Int) {
        _uiState.update { it.copy(participantCount = count.coerceIn(1, 50)) }
    }

    fun loadContextFile(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val context = getApplication<Application>()
                val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText() ?: ""
                val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "contexte.txt"
                _uiState.update { it.copy(contextText = text, contextFileName = fileName, error = null) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = "Impossible de lire le fichier: ${e.message}") }
            }
        }
    }

    fun clearContextFile() {
        _uiState.update { it.copy(contextText = "", contextFileName = "") }
    }

    fun startRecording() {
        val app = getApplication<Application>()
        meetingStartTime = System.currentTimeMillis()

        // Generate output path
        val dir = File(app.getExternalFilesDir(null), "Recordings").also { it.mkdirs() }
        val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        currentAudioPath = "${dir.absolutePath}/reunion_$ts.m4a"

        // Start foreground recording service
        val intent = Intent(app, RecordingService::class.java).apply {
            action = RecordingService.ACTION_START
            putExtra(RecordingService.EXTRA_OUTPUT_PATH, currentAudioPath)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            app.startForegroundService(intent)
        } else {
            app.startService(intent)
        }

        // Start real-time transcription
        transcriptionManager.start()

        _uiState.update {
            it.copy(
                recordingState = RecordingState.RECORDING,
                durationSeconds = 0L,
                transcript = "",
                partialText = "",
                meetingMinutes = "",
                savedAudioPath = "",
                savedTranscriptPath = "",
                savedMeetingId = -1L,
                error = null
            )
        }
    }

    fun pauseRecording() {
        val app = getApplication<Application>()
        app.startService(Intent(app, RecordingService::class.java).apply {
            action = RecordingService.ACTION_PAUSE
        })
        transcriptionManager.stop()
        _uiState.update { it.copy(recordingState = RecordingState.PAUSED) }
    }

    fun resumeRecording() {
        val app = getApplication<Application>()
        app.startService(Intent(app, RecordingService::class.java).apply {
            action = RecordingService.ACTION_RESUME
        })
        transcriptionManager.start()
        _uiState.update { it.copy(recordingState = RecordingState.RECORDING) }
    }

    fun stopRecording() {
        val app = getApplication<Application>()
        app.startService(Intent(app, RecordingService::class.java).apply {
            action = RecordingService.ACTION_STOP
        })
        transcriptionManager.stop()
        _uiState.update { it.copy(recordingState = RecordingState.STOPPED) }
    }

    fun saveTranscription(): String {
        val state = _uiState.value
        val app = getApplication<Application>()
        val dir = File(app.getExternalFilesDir(null), "Transcriptions").also { it.mkdirs() }
        val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val file = File(dir, "transcription_$ts.txt")
        file.writeText(state.transcript)
        _uiState.update { it.copy(savedTranscriptPath = file.absolutePath) }
        return file.absolutePath
    }

    fun saveMeetingToDatabase() {
        viewModelScope.launch {
            val state = _uiState.value
            val entity = MeetingEntity(
                title = "Réunion du ${SimpleDateFormat("d MMMM yyyy", Locale.FRENCH).format(Date())}",
                dateMillis = meetingStartTime,
                durationSeconds = state.durationSeconds,
                participantCount = state.participantCount,
                transcription = state.transcript,
                meetingMinutes = state.meetingMinutes,
                audioFilePath = currentAudioPath,
                contextFilePath = state.contextFileName,
                languageCode = "fr-CA"
            )
            val id = db.meetingDao().insert(entity)
            _uiState.update { it.copy(savedMeetingId = id) }
        }
    }

    fun saveApiKey(key: String) {
        viewModelScope.launch { settings.setClaudeApiKey(key) }
    }

    fun generateMeetingMinutes() {
        val state = _uiState.value
        if (state.transcript.isBlank()) {
            _uiState.update { it.copy(error = "La transcription est vide.") }
            return
        }
        _uiState.update { it.copy(isGeneratingMinutes = true, error = null) }

        viewModelScope.launch {
            val runtimeKey = settings.claudeApiKey.first()
            val result = minutesGenerator.generate(
                transcription = state.transcript,
                contextText = state.contextText.ifBlank { null },
                participantCount = state.participantCount,
                durationMinutes = state.durationSeconds / 60,
                apiKeyOverride = runtimeKey
            )
            result.fold(
                onSuccess = { minutes ->
                    _uiState.update { it.copy(meetingMinutes = minutes, isGeneratingMinutes = false) }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isGeneratingMinutes = false,
                            error = "Erreur lors de la génération: ${e.message}"
                        )
                    }
                }
            )
        }
    }

    fun saveMinutes(): String {
        val state = _uiState.value
        val app = getApplication<Application>()
        val dir = File(app.getExternalFilesDir(null), "Transcriptions").also { it.mkdirs() }
        val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val file = File(dir, "compte_rendu_$ts.md")
        file.writeText(state.meetingMinutes)
        return file.absolutePath
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun resetSession() {
        transcriptionManager.clearTranscript()
        currentAudioPath = ""
        meetingStartTime = 0L
        _uiState.update { MeetingUiState(participantCount = _uiState.value.participantCount) }
    }

    override fun onCleared() {
        super.onCleared()
        transcriptionManager.stop()
        try {
            getApplication<Application>().unregisterReceiver(durationReceiver)
        } catch (_: Exception) {}
    }
}
