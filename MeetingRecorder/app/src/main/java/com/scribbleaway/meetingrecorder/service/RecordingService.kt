package com.scribbleaway.meetingrecorder.service

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.scribbleaway.meetingrecorder.App
import com.scribbleaway.meetingrecorder.audio.BeepPlayer
import com.scribbleaway.meetingrecorder.audio.ChunkedRecorder
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.util.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

class RecordingService : LifecycleService() {

    inner class RecordingBinder : Binder() {
        fun getService(): RecordingService = this@RecordingService
    }

    private val binder = RecordingBinder()

    private val recorder = ChunkedRecorder(this)
    private val beepPlayer = BeepPlayer()

    private val _state = MutableStateFlow(RecordingState.IDLE)
    val state: StateFlow<RecordingState> = _state.asStateFlow()

    private val _elapsedSeconds = MutableStateFlow(0L)
    val elapsedSeconds: StateFlow<Long> = _elapsedSeconds.asStateFlow()

    private val _chunkCount = MutableStateFlow(0)
    val chunkCount: StateFlow<Int> = _chunkCount.asStateFlow()

    private var timerJob: Job? = null
    private var currentMeetingId: Long = -1
    private var recordingStartMs = 0L
    private var pausedElapsed = 0L

    override fun onBind(intent: Intent): IBinder {
        super.onBind(intent)
        return binder
    }

    fun startRecording(meetingId: Long, chunkDurationMinutes: Int) {
        currentMeetingId = meetingId
        _chunkCount.value = 1
        val meetingDir = meetingDir(this, meetingId)
        val firstChunkFile = File(meetingDir, "chunk_0.m4a")

        lifecycleScope.launch {
            beepPlayer.beepStart()

            recorder.start(
                chunkFile = firstChunkFile,
                chunkDurationMs = chunkDurationMinutes * 60_000L,
                scope = lifecycleScope
            ) { chunkInfo ->
                lifecycleScope.launch {
                    saveChunk(chunkInfo)
                    _chunkCount.value = chunkInfo.index + 2
                }
            }

            _state.value = RecordingState.RECORDING
            recordingStartMs = System.currentTimeMillis()
            pausedElapsed = 0L
            startTimer()
            startForeground(RECORDING_NOTIFICATION_ID, buildRecordingNotification(this@RecordingService, "00:00", false))
        }
    }

    fun pauseRecording() {
        if (_state.value != RecordingState.RECORDING) return
        lifecycleScope.launch {
            beepPlayer.beepPause()
            recorder.pause()
            pausedElapsed = _elapsedSeconds.value
            timerJob?.cancel()
            _state.value = RecordingState.PAUSED
            updateNotification(isPaused = true)
        }
    }

    fun resumeRecording() {
        if (_state.value != RecordingState.PAUSED) return
        lifecycleScope.launch {
            beepPlayer.beepStart()
            recorder.resume()
            recordingStartMs = System.currentTimeMillis()
            _state.value = RecordingState.RECORDING
            startTimer()
            updateNotification(isPaused = false)
        }
    }

    fun stopRecording(): List<ChunkedRecorder.ChunkInfo> {
        lifecycleScope.launch { beepPlayer.beepStop() }
        timerJob?.cancel()
        _state.value = RecordingState.STOPPED
        val chunks = recorder.stop()
        stopForeground(Service.STOP_FOREGROUND_REMOVE)
        return chunks
    }

    fun cancelRecording(): List<java.io.File> {
        lifecycleScope.launch { beepPlayer.beepStop() }
        timerJob?.cancel()
        val files = recorder.cancel()
        _state.value = RecordingState.IDLE
        _elapsedSeconds.value = 0L
        _chunkCount.value = 0
        stopForeground(Service.STOP_FOREGROUND_REMOVE)
        return files
    }

    fun resetToIdle() {
        _state.value = RecordingState.IDLE
        _elapsedSeconds.value = 0L
        _chunkCount.value = 0
        stopSelf()
    }

    private fun startTimer() {
        timerJob = lifecycleScope.launch {
            val base = pausedElapsed
            val startMs = System.currentTimeMillis()
            while (isActive) {
                val elapsed = base + (System.currentTimeMillis() - startMs) / 1000
                _elapsedSeconds.value = elapsed
                updateNotification(isPaused = false)
                delay(1000)
            }
        }
    }

    private fun updateNotification(isPaused: Boolean) {
        val notification = buildRecordingNotification(
            this,
            formatElapsed(_elapsedSeconds.value),
            isPaused
        )
        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        nm.notify(RECORDING_NOTIFICATION_ID, notification)
    }

    private suspend fun saveChunk(info: ChunkedRecorder.ChunkInfo) {
        val app = application as App
        app.meetingRepository.savePendingChunk(
            currentMeetingId,
            Chunk(
                meetingId = currentMeetingId,
                index = info.index,
                filePath = info.file.absolutePath,
                offsetSeconds = info.offsetSeconds,
                durationSeconds = 0.0
            )
        )
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel(this)
    }

    override fun onDestroy() {
        super.onDestroy()
        beepPlayer.release()
    }
}

enum class RecordingState { IDLE, RECORDING, PAUSED, STOPPED }
