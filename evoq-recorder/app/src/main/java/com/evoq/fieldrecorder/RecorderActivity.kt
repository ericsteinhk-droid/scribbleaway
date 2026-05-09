package com.evoq.fieldrecorder

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.evoq.fieldrecorder.databinding.ActivityRecorderBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class RecorderActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_LANGUAGE = "extra_language"
        private const val REQUEST_AUDIO_PERMISSION = 101
    }

    private lateinit var binding: ActivityRecorderBinding
    private var language = "en-CA"
    private var isRecording = false
    private var speechRecognizer: SpeechRecognizer? = null
    private val transcriptBuilder = StringBuilder()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRecorderBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        language = intent.getStringExtra(EXTRA_LANGUAGE) ?: "en-CA"
        supportActionBar?.title = if (language.startsWith("fr")) "Français" else "English"

        binding.btnRecord.setOnClickListener {
            if (isRecording) stopRecording() else checkPermissionAndRecord()
        }
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
        transcriptBuilder.clear()

        binding.btnRecord.text = getString(R.string.stop_recording)
        binding.btnRecord.setBackgroundColor(getColor(R.color.recording_red))
        binding.tvStatus.text = getString(R.string.recording)
        binding.chronometer.base = SystemClock.elapsedRealtime()
        binding.chronometer.start()

        startListening()
    }

    private fun startListening() {
        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                binding.tvStatus.text = getString(R.string.recording)
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                // Silently restart on recoverable errors while recording
                if (isRecording && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    startListening()
                }
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    transcriptBuilder.append(matches[0]).append(" ")
                    binding.tvTranscript.text = transcriptBuilder.toString().trim()
                }
                if (isRecording) startListening()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull() ?: return
                binding.tvTranscript.text =
                    (transcriptBuilder.toString() + partial).trim()
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        speechRecognizer?.startListening(intent)
    }

    private fun stopRecording() {
        isRecording = false
        binding.chronometer.stop()
        binding.btnRecord.text = getString(R.string.start_recording)
        binding.btnRecord.setBackgroundColor(getColor(R.color.evoq_gold))
        binding.tvStatus.text = getString(R.string.processing)

        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null

        val transcript = transcriptBuilder.toString().trim()
        if (transcript.isEmpty()) {
            binding.tvStatus.text = getString(R.string.no_transcript)
            binding.btnRecord.text = getString(R.string.start_recording)
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

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            if (isRecording) stopRecording()
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    override fun onDestroy() {
        super.onDestroy()
        isRecording = false
        speechRecognizer?.destroy()
    }
}
