package com.evoq.fieldrecorder

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.MenuItem
import android.view.View
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.evoq.fieldrecorder.databinding.ActivityWhisperRecorderBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.sqrt

class WhisperRecorderActivity : BaseActivity() {

    companion object {
        const val EXTRA_LANGUAGE = "extra_language"
        private const val REQUEST_AUDIO_PERMISSION = 102
        private const val SAMPLE_RATE = 16000
        private const val SILENCE_THRESHOLD_RMS = 800.0
        private const val SILENCE_PAUSE_MS = 5000L
        private const val WARMUP_MS = 1500L           // ignore silence during mic warmup
        private const val MIN_PCM_BYTES = SAMPLE_RATE * 2  // 1 second minimum
    }

    private lateinit var binding: ActivityWhisperRecorderBinding
    private var language = "en-CA"
    private var isRecording = false
    private var isPaused = false
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val pcmBuffer = ByteArrayOutputStream()
    private val transcriptBuilder = StringBuilder()
    private var pendingTranscriptions = 0
    private var chronoElapsedBeforePause = 0L

    private val handler = Handler(Looper.getMainLooper())

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWhisperRecorderBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(R.string.hifi_recorder_title)

        language = intent.getStringExtra(EXTRA_LANGUAGE) ?: "en-CA"

        binding.btnPauseResume.setOnClickListener {
            when {
                !isRecording -> checkPermissionAndRecord()
                isPaused     -> resumeRecording()
                else         -> pauseRecording(fromSilence = false)
            }
        }
        binding.btnGenerateReport.setOnClickListener { stopAndGenerate() }
    }

    private fun checkPermissionAndRecord() {
        val openAiKey = getSharedPreferences("evoq_prefs", MODE_PRIVATE)
            .getString("openai_api_key", "") ?: ""
        if (openAiKey.isBlank()) {
            val isFr = language.startsWith("fr")
            AlertDialog.Builder(this)
                .setTitle(if (isFr) "Clé API OpenAI requise" else "OpenAI API Key Required")
                .setMessage(if (isFr)
                    "Ajoutez votre clé API OpenAI dans Paramètres pour activer la transcription Whisper."
                    else
                    "Add your OpenAI API key in Settings to enable Whisper transcription.")
                .setPositiveButton(getString(R.string.settings)) { _, _ ->
                    startActivity(Intent(this, SettingsActivity::class.java))
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this, arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO_PERMISSION
            )
        } else {
            startRecording()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_AUDIO_PERMISSION
            && grantResults.isNotEmpty()
            && grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) startRecording()
    }

    private fun startRecording() {
        isRecording = true
        isPaused = false
        transcriptBuilder.clear()
        pcmBuffer.reset()
        chronoElapsedBeforePause = 0L
        pendingTranscriptions = 0

        binding.tvStatus.text = getString(R.string.listening)
        binding.btnPauseResume.text = getString(R.string.pause)
        binding.btnGenerateReport.isEnabled = false
        binding.tvTranscriptHint.visibility = View.VISIBLE
        binding.tvTranscript.text = ""
        binding.chronometer.base = SystemClock.elapsedRealtime()
        binding.chronometer.start()

        startPulseAnimation()
        playFeedback(start = true)
        startAudioCapture()
    }

    private fun pauseRecording(fromSilence: Boolean) {
        if (!isRecording || isPaused) return
        isPaused = true
        captureJob?.cancel()
        captureJob = null
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        chronoElapsedBeforePause = SystemClock.elapsedRealtime() - binding.chronometer.base
        binding.chronometer.stop()
        stopPulseAnimation()

        val label = if (fromSilence) getString(R.string.paused_silence) else getString(R.string.paused)
        binding.tvStatus.text = label
        binding.btnPauseResume.text = getString(R.string.resume)
        binding.btnGenerateReport.isEnabled = true

        flushBufferToWhisper()
    }

    private fun resumeRecording() {
        isPaused = false
        pcmBuffer.reset()

        binding.tvStatus.text = getString(R.string.listening)
        binding.btnPauseResume.text = getString(R.string.pause)
        binding.chronometer.base = SystemClock.elapsedRealtime() - chronoElapsedBeforePause
        binding.chronometer.start()

        startPulseAnimation()
        startAudioCapture()
    }

    private fun startAudioCapture() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) return

        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        val bufferSize = maxOf(minBuffer, 4096)

        val ar = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, bufferSize
        )
        if (ar.state != AudioRecord.STATE_INITIALIZED) {
            ar.release()
            Toast.makeText(this, "Microphone unavailable — try again", Toast.LENGTH_LONG).show()
            isRecording = false
            binding.btnPauseResume.text = getString(R.string.start_recording)
            stopPulseAnimation()
            binding.chronometer.stop()
            return
        }
        audioRecord = ar
        ar.startRecording()

        captureJob = lifecycleScope.launch(Dispatchers.IO) {
            val readBuf = ByteArray(bufferSize)
            var silentMs = 0L
            var warmupMs = 0L
            var lastTs = System.currentTimeMillis()

            while (isActive) {
                val read = ar.read(readBuf, 0, bufferSize)
                if (read <= 0) continue

                val now = System.currentTimeMillis()
                val elapsed = now - lastTs
                lastTs = now

                synchronized(pcmBuffer) { pcmBuffer.write(readBuf, 0, read) }

                // Skip silence detection during warmup so mic can settle
                if (warmupMs < WARMUP_MS) {
                    warmupMs += elapsed
                    continue
                }

                val rms = calculateRms(readBuf, read)
                if (rms < SILENCE_THRESHOLD_RMS) {
                    silentMs += elapsed
                    if (silentMs >= SILENCE_PAUSE_MS) {
                        withContext(Dispatchers.Main) { pauseRecording(fromSilence = true) }
                        break
                    }
                } else {
                    silentMs = 0L
                }
            }
        }
    }

    private fun calculateRms(buf: ByteArray, len: Int): Double {
        var sum = 0.0
        var i = 0
        while (i < len - 1) {
            val sample = (buf[i + 1].toInt() shl 8) or (buf[i].toInt() and 0xFF)
            sum += sample.toDouble() * sample
            i += 2
        }
        val count = len / 2
        return if (count > 0) sqrt(sum / count) else 0.0
    }

    private fun flushBufferToWhisper() {
        val pcmData: ByteArray
        synchronized(pcmBuffer) {
            pcmData = pcmBuffer.toByteArray()
            pcmBuffer.reset()
        }
        if (pcmData.size < MIN_PCM_BYTES) return

        val openAiKey = getSharedPreferences("evoq_prefs", MODE_PRIVATE)
            .getString("openai_api_key", "") ?: ""
        if (openAiKey.isBlank()) {
            appendTranscript("[No OpenAI key — add it in Settings]")
            return
        }

        pendingTranscriptions++
        updateTranscribingIndicator()

        val wavBytes = WavUtils.pcmToWav(pcmData, SAMPLE_RATE)
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) { callWhisperApi(openAiKey, wavBytes) }
            pendingTranscriptions--
            updateTranscribingIndicator()
            appendWhisperResult(result)
        }
    }

    private fun appendWhisperResult(result: String) {
        when {
            result.startsWith("ERR:invalid_key") ->
                Toast.makeText(this, "Invalid OpenAI key — check Settings", Toast.LENGTH_LONG).show()
            result.startsWith("ERR:rate_limit") ->
                Toast.makeText(this, "OpenAI rate limit — wait a moment and try again", Toast.LENGTH_LONG).show()
            result.startsWith("ERR:") ->
                Toast.makeText(this, "Transcription failed (${result.removePrefix("ERR:")})", Toast.LENGTH_LONG).show()
            result.isNotBlank() -> appendTranscript(result)
            // empty string = Whisper received audio but heard nothing (silence/noise)
        }
    }

    private fun appendTranscript(text: String) {
        if (transcriptBuilder.isNotEmpty()) transcriptBuilder.append("\n\n")
        transcriptBuilder.append(text)
        binding.tvTranscriptHint.visibility = View.GONE
        binding.tvTranscript.text = transcriptBuilder.toString()
        binding.scrollTranscript.post { binding.scrollTranscript.fullScroll(View.FOCUS_DOWN) }
    }

    private fun updateTranscribingIndicator() {
        binding.layoutTranscribing.visibility =
            if (pendingTranscriptions > 0) View.VISIBLE else View.GONE
    }

    private fun callWhisperApi(apiKey: String, wavBytes: ByteArray): String {
        val langCode = if (language.startsWith("fr")) "fr" else "en"
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("model", "whisper-1")
            .addFormDataPart("language", langCode)
            .addFormDataPart("file", "audio.wav",
                wavBytes.toRequestBody("audio/wav".toMediaType()))
            .build()

        val request = Request.Builder()
            .url("https://api.openai.com/v1/audio/transcriptions")
            .addHeader("Authorization", "Bearer $apiKey")
            .post(body)
            .build()

        return try {
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""
            when {
                response.code == 401 -> "ERR:invalid_key"
                response.code == 429 -> "ERR:rate_limit"
                !response.isSuccessful -> "ERR:api_${response.code}"
                else -> JSONObject(responseBody).optString("text", "")
            }
        } catch (e: Exception) {
            "ERR:network"
        }
    }

    private fun stopAndGenerate() {
        isRecording = false
        isPaused = false
        captureJob?.cancel()
        captureJob = null
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        binding.chronometer.stop()
        stopPulseAnimation()
        playFeedback(start = false)
        binding.btnGenerateReport.isEnabled = false
        binding.btnPauseResume.isEnabled = false

        val pcmData: ByteArray
        synchronized(pcmBuffer) { pcmData = pcmBuffer.toByteArray() }

        if (pcmData.size >= MIN_PCM_BYTES) {
            val openAiKey = getSharedPreferences("evoq_prefs", MODE_PRIVATE)
                .getString("openai_api_key", "") ?: ""
            if (openAiKey.isNotBlank()) {
                pendingTranscriptions++
                updateTranscribingIndicator()
                binding.tvStatus.text = getString(R.string.processing)
                val wavBytes = WavUtils.pcmToWav(pcmData, SAMPLE_RATE)
                lifecycleScope.launch {
                    val result = withContext(Dispatchers.IO) { callWhisperApi(openAiKey, wavBytes) }
                    pendingTranscriptions--
                    updateTranscribingIndicator()
                    appendWhisperResult(result)
                    waitForPendingThenNavigate()
                }
                return
            }
        }
        waitForPendingThenNavigate()
    }

    private fun waitForPendingThenNavigate() {
        if (pendingTranscriptions > 0) {
            handler.postDelayed({ waitForPendingThenNavigate() }, 500)
            return
        }
        val transcript = transcriptBuilder.toString().trim()
        if (transcript.isEmpty()) {
            binding.tvStatus.text = getString(R.string.no_transcript)
            binding.btnPauseResume.text = getString(R.string.start_recording)
            binding.btnPauseResume.isEnabled = true
            return
        }
        startActivity(Intent(this, ReportActivity::class.java).apply {
            putExtra(ReportActivity.EXTRA_TRANSCRIPT, transcript)
            putExtra(ReportActivity.EXTRA_LANGUAGE, language)
            putExtra(ReportActivity.EXTRA_RECORDING_DATE,
                SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()))
        })
    }

    private var pulseAnimation: AlphaAnimation? = null

    private fun startPulseAnimation() {
        pulseAnimation = AlphaAnimation(1f, 0.2f).apply {
            duration = 700
            repeatMode = Animation.REVERSE
            repeatCount = Animation.INFINITE
        }
        binding.ivMicIndicator.startAnimation(pulseAnimation)
    }

    private fun stopPulseAnimation() {
        binding.ivMicIndicator.clearAnimation()
        binding.ivMicIndicator.alpha = 0.25f
    }

    private fun playFeedback(start: Boolean) {
        @Suppress("DEPRECATION")
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (vibrator != null) {
            val duration = if (start) 60L else 100L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                vibrator.vibrate(duration)
            }
        }
        try {
            val tone = if (start) ToneGenerator.TONE_PROP_BEEP else ToneGenerator.TONE_PROP_ACK
            val toneGen = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75)
            toneGen.startTone(tone, 120)
            handler.postDelayed({ toneGen.release() }, 300)
        } catch (e: Exception) {}
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            if (isRecording) stopAndGenerate() else finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    override fun onDestroy() {
        super.onDestroy()
        captureJob?.cancel()
        audioRecord?.release()
        audioRecord = null
    }
}
