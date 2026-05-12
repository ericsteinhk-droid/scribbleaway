package com.evoq.fieldrecorder

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.evoq.fieldrecorder.databinding.ActivityRecorderBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class RecorderActivity : BaseActivity() {

    companion object {
        const val EXTRA_LANGUAGE = "extra_language"
        private const val REQUEST_AUDIO_PERMISSION = 101
        private const val SILENCE_PARAGRAPH_MS = 4000L
    }

    private lateinit var binding: ActivityRecorderBinding
    private var language = "en-CA"
    private var isRecording = false
    private var isPaused = false
    private var speechRecognizer: SpeechRecognizer? = null
    private val transcriptBuilder = StringBuilder()
    private var chronoElapsedBeforePause = 0L

    private val handler = Handler(Looper.getMainLooper())
    private val silenceRunnable = Runnable {
        if (isRecording && !isPaused && transcriptBuilder.isNotEmpty()) {
            if (!transcriptBuilder.endsWith("\n\n")) {
                transcriptBuilder.append("\n\n")
                binding.tvTranscript.text = transcriptBuilder.toString().trimEnd()
            }
        }
    }

    // Whisper audio recording
    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var hasAudioFile = false

    private val whisperClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS)
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRecorderBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        language = intent.getStringExtra(EXTRA_LANGUAGE) ?: "en-CA"
        supportActionBar?.title = getString(R.string.recorder_title)
        binding.tvContextHint.text = getString(
            if (language.startsWith("fr")) R.string.context_hint_fr else R.string.context_hint_en
        )

        binding.btnRecord.setOnClickListener { checkPermissionAndRecord() }
        binding.btnPause.setOnClickListener { togglePause() }
        binding.btnStop.setOnClickListener { stopRecording() }
    }

    private fun checkPermissionAndRecord() {
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
        ) {
            startRecording()
        } else {
            Toast.makeText(this, getString(R.string.permission_denied), Toast.LENGTH_LONG).show()
        }
    }

    private fun startRecording() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Toast.makeText(this, getString(R.string.speech_not_available), Toast.LENGTH_LONG).show()
            return
        }
        isRecording = true
        isPaused = false
        transcriptBuilder.clear()
        chronoElapsedBeforePause = 0L

        showRecordingButtons()
        binding.cardContextHint.visibility = View.GONE
        binding.btnPause.text = getString(R.string.pause)
        binding.tvStatus.text = getString(R.string.recording)
        binding.chronometer.base = SystemClock.elapsedRealtime()
        binding.chronometer.start()

        startMediaRecording()
        startListening()
    }

    private fun startMediaRecording() {
        val file = File(cacheDir, "rec_${System.currentTimeMillis()}.m4a")
        audioFile = file
        hasAudioFile = false
        try {
            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION") MediaRecorder()
            }
            mediaRecorder!!.apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(32_000)
                setAudioSamplingRate(16_000)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            hasAudioFile = true
        } catch (e: Exception) {
            // Mic could not be shared — Whisper unavailable, live transcript will be used
            mediaRecorder?.release()
            mediaRecorder = null
        }
    }

    private fun togglePause() {
        if (isPaused) {
            isPaused = false
            binding.btnPause.text = getString(R.string.pause)
            binding.tvStatus.text = getString(R.string.recording)
            binding.chronometer.base = SystemClock.elapsedRealtime() - chronoElapsedBeforePause
            binding.chronometer.start()
            mediaRecorder?.resume()
            startListening()
        } else {
            isPaused = true
            handler.removeCallbacks(silenceRunnable)
            binding.btnPause.text = getString(R.string.resume)
            binding.tvStatus.text = getString(R.string.paused)
            chronoElapsedBeforePause = SystemClock.elapsedRealtime() - binding.chronometer.base
            binding.chronometer.stop()
            speechRecognizer?.stopListening()
            speechRecognizer?.destroy()
            speechRecognizer = null
            mediaRecorder?.pause()

            if (transcriptBuilder.isNotEmpty() && !transcriptBuilder.endsWith("\n\n")) {
                transcriptBuilder.append("\n\n")
                binding.tvTranscript.text = transcriptBuilder.toString().trimEnd()
            }
        }
    }

    private fun startListening() {
        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                if (isRecording && !isPaused
                    && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                ) {
                    startListening()
                }
            }

            override fun onResults(results: Bundle?) {
                val match = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull() ?: return
                transcriptBuilder.append(match).append(" ")
                binding.tvTranscript.text = transcriptBuilder.toString().trimEnd()
                resetSilenceTimer()
                if (isRecording && !isPaused) startListening()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull() ?: return
                binding.tvTranscript.text =
                    (transcriptBuilder.toString() + partial).trimEnd()
                handler.removeCallbacks(silenceRunnable)
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            if (Build.VERSION.SDK_INT >= 33) {
                val biasingStrings = if (language.startsWith("fr")) {
                    arrayListOf(
                        "terrazzo", "gypse", "démolition", "hygiène", "enceinte",
                        "ossature", "panneau", "fenêtre", "corridor", "plafond",
                        "travaux", "ouvriers", "travailleurs", "maçons", "béton", "plâtre"
                    )
                } else {
                    arrayListOf(
                        "terrazzo", "gypsum", "demolition", "hygiene", "enclosure",
                        "framing", "panel", "window", "corridor", "ceiling",
                        "works", "workers", "masons", "concrete", "plaster"
                    )
                }
                putExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, biasingStrings)
            }
        }
        speechRecognizer?.startListening(intent)
    }

    private fun resetSilenceTimer() {
        handler.removeCallbacks(silenceRunnable)
        handler.postDelayed(silenceRunnable, SILENCE_PARAGRAPH_MS)
    }

    private fun stopRecording() {
        isRecording = false
        isPaused = false
        handler.removeCallbacks(silenceRunnable)
        binding.chronometer.stop()
        showStartButton()
        binding.cardContextHint.visibility = View.VISIBLE

        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null

        var audioReady = hasAudioFile
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
        } catch (e: Exception) {
            audioReady = false
        }
        mediaRecorder = null

        val openAiKey = getSharedPreferences("evoq_prefs", MODE_PRIVATE)
            .getString("openai_api_key", "") ?: ""

        val localFile = audioFile
        if (audioReady && localFile?.exists() == true && openAiKey.isNotBlank()) {
            binding.tvStatus.text = getString(R.string.transcribing_whisper)
            binding.btnRecord.isEnabled = false
            lifecycleScope.launch {
                val whisperTranscript = withContext(Dispatchers.IO) {
                    callWhisperApi(openAiKey, localFile, language)
                }
                localFile.delete()
                audioFile = null
                binding.btnRecord.isEnabled = true
                val finalTranscript = if (whisperTranscript.isNullOrBlank()) {
                    transcriptBuilder.toString().trim()
                } else {
                    whisperTranscript
                }
                proceedToReport(finalTranscript)
            }
        } else {
            audioFile?.delete()
            audioFile = null
            proceedToReport(transcriptBuilder.toString().trim())
        }
    }

    private fun proceedToReport(transcript: String) {
        if (transcript.isEmpty()) {
            binding.tvStatus.text = getString(R.string.no_transcript)
            Toast.makeText(this, getString(R.string.no_transcript), Toast.LENGTH_LONG).show()
            return
        }
        startActivity(Intent(this, ReportActivity::class.java).apply {
            putExtra(ReportActivity.EXTRA_TRANSCRIPT, transcript)
            putExtra(ReportActivity.EXTRA_LANGUAGE, language)
            putExtra(ReportActivity.EXTRA_RECORDING_DATE,
                SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()))
        })
    }

    private fun callWhisperApi(apiKey: String, file: File, lang: String): String? {
        return try {
            val langCode = if (lang.startsWith("fr")) "fr" else "en"
            val body = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("model", "whisper-1")
                .addFormDataPart("language", langCode)
                .addFormDataPart(
                    "file", file.name,
                    file.asRequestBody("audio/mp4".toMediaType())
                )
                .build()
            val request = Request.Builder()
                .url("https://api.openai.com/v1/audio/transcriptions")
                .addHeader("Authorization", "Bearer $apiKey")
                .post(body)
                .build()
            val response = whisperClient.newCall(request).execute()
            val responseBody = response.body?.string() ?: return null
            if (!response.isSuccessful) null
            else JSONObject(responseBody).getString("text")
        } catch (e: Exception) {
            null
        }
    }

    private fun showRecordingButtons() {
        binding.btnRecord.visibility = View.GONE
        binding.layoutRecordingControls.visibility = View.VISIBLE
    }

    private fun showStartButton() {
        binding.layoutRecordingControls.visibility = View.GONE
        binding.btnRecord.visibility = View.VISIBLE
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            if (isRecording) stopRecording() else finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(silenceRunnable)
        speechRecognizer?.destroy()
        try { mediaRecorder?.stop(); mediaRecorder?.release() } catch (e: Exception) { }
        mediaRecorder = null
        audioFile?.delete()
    }
}
