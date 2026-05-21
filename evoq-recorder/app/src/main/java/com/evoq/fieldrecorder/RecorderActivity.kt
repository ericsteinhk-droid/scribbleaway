package com.evoq.fieldrecorder

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.evoq.fieldrecorder.databinding.ActivityRecorderBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class RecorderActivity : BaseActivity() {

    companion object {
        const val EXTRA_LANGUAGE = "extra_language"
        private const val REQUEST_AUDIO_PERMISSION = 101
        private const val SILENCE_PARAGRAPH_MS = 4000L
        private const val PAUSE_CLEANUP_TIMEOUT_MS = 2500L
        private const val KEY_TRANSCRIPT = "saved_transcript"
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

    // Safety net: if stopListening() never delivers a callback, clean up after timeout.
    private val pauseCleanupRunnable = Runnable {
        if (isPaused) finalizePause()
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

        // Restore transcript that survived a config-change or system-kill recreation.
        savedInstanceState?.getString(KEY_TRANSCRIPT)?.takeIf { it.isNotEmpty() }?.let { saved ->
            transcriptBuilder.append(saved)
            binding.tvTranscript.text = saved.trimEnd()
        }

        binding.btnRecord.setOnClickListener { checkPermissionAndRecord() }
        binding.btnPause.setOnClickListener { togglePause() }
        binding.btnStop.setOnClickListener { stopRecording() }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_TRANSCRIPT, transcriptBuilder.toString())
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

        playFeedback(start = true)
        startListening()
    }

    private fun togglePause() {
        if (isPaused) {
            // Resume: cancel the cleanup timeout and start listening again.
            handler.removeCallbacks(pauseCleanupRunnable)
            isPaused = false
            binding.btnPause.text = getString(R.string.pause)
            binding.tvStatus.text = getString(R.string.recording)
            binding.chronometer.base = SystemClock.elapsedRealtime() - chronoElapsedBeforePause
            binding.chronometer.start()
            startListening()
        } else {
            // Pause: stop the recognizer but do NOT destroy it yet.
            // onResults/onError will capture any final in-flight words and then call finalizePause().
            isPaused = true
            handler.removeCallbacks(silenceRunnable)
            binding.btnPause.text = getString(R.string.resume)
            binding.tvStatus.text = getString(R.string.paused)
            chronoElapsedBeforePause = SystemClock.elapsedRealtime() - binding.chronometer.base
            binding.chronometer.stop()
            speechRecognizer?.stopListening()
            // Safety: if no callback arrives within the timeout, clean up anyway.
            handler.postDelayed(pauseCleanupRunnable, PAUSE_CLEANUP_TIMEOUT_MS)
        }
    }

    /** Appends paragraph break, destroys the recognizer, and refreshes the transcript view. */
    private fun finalizePause() {
        handler.removeCallbacks(pauseCleanupRunnable)
        speechRecognizer?.destroy()
        speechRecognizer = null
        if (transcriptBuilder.isNotEmpty() && !transcriptBuilder.endsWith("\n\n")) {
            transcriptBuilder.append("\n\n")
        }
        binding.tvTranscript.text = transcriptBuilder.toString().trimEnd()
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
                if (isPaused) {
                    finalizePause()
                } else if (isRecording && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    startListening()
                }
            }

            override fun onResults(results: Bundle?) {
                val match = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()

                if (match != null) {
                    transcriptBuilder.append(match).append(" ")
                }

                if (isPaused) {
                    finalizePause()
                } else if (isRecording) {
                    binding.tvTranscript.text = transcriptBuilder.toString().trimEnd()
                    resetSilenceTimer()
                    startListening()
                }
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
                        // Terrazzo phonetic variants
                        "terrazzo", "terrazo", "terrazeau", "terrasse au",
                        // Matériaux
                        "béton", "bloc de béton", "béton armé",
                        "gypse", "gypse laminé",
                        "plâtre", "plâtrage",
                        "maçonnerie", "terracotta",
                        "tôle", "quartz", "scellant", "silicone",
                        "plinthes", "moulures",
                        "cadre de porte", "porte métallique", "quincaillerie de porte", "ferme-porte",
                        "manchon", "conduit électrique", "conduit de ventilation",
                        "tuyauterie", "gicleur", "détecteur de fumée",
                        "drain de plancher", "tuile de plafond",
                        "coffrage", "colombage", "linteau", "fourrure", "ignifuge",
                        // Activités
                        "démolition", "découpe", "percement", "étaiement",
                        "coulée de béton", "pose de gypse",
                        "installation de cloisons", "installation de portes",
                        "installation électrique", "installation plomberie", "installation ventilation",
                        "scellement", "finition", "délestage",
                        "filage électrique", "mise en cure",
                        "vérification coupe-feu", "installation d'ancrages",
                        // Intervenants
                        "surintendant", "gérant de projet", "chargé de projet",
                        "coordonnateur", "surveillant de chantier",
                        "ingénieur mécanique", "ingénieur électrique", "ingénieur structure",
                        "entrepreneur général", "sous-traitants",
                        // Acronymes
                        "CVAC", "DDC", "ATK", "BX", "POM", "UdeM",
                        // Termes existants
                        "hygiène", "enceinte", "ossature", "panneau", "fenêtre",
                        "corridor", "plafond", "travaux", "ouvriers", "travailleurs", "maçons"
                    )
                } else {
                    arrayListOf(
                        "terrazzo", "gypsum", "demolition", "hygiene", "enclosure",
                        "framing", "panel", "window", "corridor", "ceiling",
                        "concrete", "plaster", "formwork", "lintel", "fireproofing",
                        "sprinkler", "smoke detector", "floor drain", "ceiling tile",
                        "electrical conduit", "ventilation duct", "plumbing",
                        "superintendent", "project manager", "site supervisor",
                        "mechanical engineer", "electrical engineer", "structural engineer",
                        "general contractor", "subcontractors"
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
        handler.removeCallbacks(pauseCleanupRunnable)
        binding.chronometer.stop()
        showStartButton()
        binding.cardContextHint.visibility = View.VISIBLE

        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null

        playFeedback(start = false)

        val transcript = transcriptBuilder.toString().trim()
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
        } catch (e: Exception) { /* device may not support ToneGenerator */ }
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
        handler.removeCallbacks(pauseCleanupRunnable)
        speechRecognizer?.destroy()
    }
}
