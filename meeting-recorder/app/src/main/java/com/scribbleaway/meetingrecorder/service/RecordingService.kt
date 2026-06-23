package com.scribbleaway.meetingrecorder.service

import android.app.*
import android.content.Intent
import android.media.MediaRecorder
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.scribbleaway.meetingrecorder.MeetingRecorderApp
import com.scribbleaway.meetingrecorder.R
import com.scribbleaway.meetingrecorder.MainActivity
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class RecordingService : Service() {

    companion object {
        const val ACTION_START = "com.scribbleaway.meetingrecorder.START_RECORDING"
        const val ACTION_STOP = "com.scribbleaway.meetingrecorder.STOP_RECORDING"
        const val ACTION_PAUSE = "com.scribbleaway.meetingrecorder.PAUSE_RECORDING"
        const val ACTION_RESUME = "com.scribbleaway.meetingrecorder.RESUME_RECORDING"
        const val EXTRA_OUTPUT_PATH = "output_path"
        const val BROADCAST_DURATION = "com.scribbleaway.meetingrecorder.DURATION_UPDATE"
        const val EXTRA_DURATION_SECONDS = "duration_seconds"
        private const val NOTIFICATION_ID = 1001
        private const val TAG = "RecordingService"
    }

    private var mediaRecorder: MediaRecorder? = null
    private var outputFilePath: String = ""
    private var startTimeMs: Long = 0L
    private var pausedDurationMs: Long = 0L
    private var pauseStartMs: Long = 0L
    private var isPaused = false

    private val handler = Handler(Looper.getMainLooper())
    private val durationRunnable = object : Runnable {
        override fun run() {
            broadcastDuration()
            updateNotification()
            handler.postDelayed(this, 1000L)
        }
    }

    private val wakeLock: PowerManager.WakeLock by lazy {
        (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MeetingRecorder::RecordingWakeLock")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                outputFilePath = intent.getStringExtra(EXTRA_OUTPUT_PATH) ?: createOutputPath()
                startRecording()
            }
            ACTION_PAUSE -> pauseRecording()
            ACTION_RESUME -> resumeRecording()
            ACTION_STOP -> stopRecording()
        }
        return START_NOT_STICKY
    }

    private fun startRecording() {
        startForeground(NOTIFICATION_ID, buildNotification("0:00"))

        wakeLock.acquire(3 * 60 * 60 * 1000L) // max 3 hours

        mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(this)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        mediaRecorder?.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioEncodingBitRate(128_000)   // 128 kbps — high quality for speech
            setAudioSamplingRate(44_100)        // 44.1 kHz for clarity
            setAudioChannels(1)                 // mono is sufficient and smaller
            setOutputFile(outputFilePath)

            try {
                prepare()
                start()
                startTimeMs = SystemClock.elapsedRealtime()
                handler.post(durationRunnable)
                Log.d(TAG, "Recording started: $outputFilePath")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start recording", e)
                stopSelf()
            }
        }
    }

    private fun pauseRecording() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !isPaused) {
            mediaRecorder?.pause()
            pauseStartMs = SystemClock.elapsedRealtime()
            isPaused = true
            Log.d(TAG, "Recording paused")
        }
    }

    private fun resumeRecording() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isPaused) {
            mediaRecorder?.resume()
            pausedDurationMs += SystemClock.elapsedRealtime() - pauseStartMs
            isPaused = false
            Log.d(TAG, "Recording resumed")
        }
    }

    private fun stopRecording() {
        handler.removeCallbacks(durationRunnable)
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recorder", e)
        }
        mediaRecorder = null

        if (wakeLock.isHeld) wakeLock.release()

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.d(TAG, "Recording stopped, file: $outputFilePath")
    }

    private fun elapsedSeconds(): Long {
        if (startTimeMs == 0L) return 0L
        val elapsed = SystemClock.elapsedRealtime() - startTimeMs - pausedDurationMs
        return elapsed / 1000L
    }

    private fun broadcastDuration() {
        val intent = Intent(BROADCAST_DURATION).apply {
            putExtra(EXTRA_DURATION_SECONDS, elapsedSeconds())
        }
        sendBroadcast(intent)
    }

    private fun updateNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(formatDuration(elapsedSeconds())))
    }

    private fun buildNotification(duration: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, MeetingRecorderApp.RECORDING_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText("${getString(R.string.notification_text)} — $duration")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun formatDuration(seconds: Long): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    private fun createOutputPath(): String {
        val dir = File(getExternalFilesDir(null), "Recordings")
        dir.mkdirs()
        val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        return "${dir.absolutePath}/reunion_$ts.m4a"
    }

    override fun onDestroy() {
        handler.removeCallbacks(durationRunnable)
        if (mediaRecorder != null) stopRecording()
        super.onDestroy()
    }
}
