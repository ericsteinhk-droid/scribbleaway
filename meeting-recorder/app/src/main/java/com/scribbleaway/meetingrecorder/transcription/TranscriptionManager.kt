package com.scribbleaway.meetingrecorder.transcription

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale

/**
 * Manages continuous real-time speech recognition using Android's SpeechRecognizer.
 *
 * Strategy for long meetings (45 min – 2 hrs):
 * - SpeechRecognizer stops after ~60 s of silence or ~60 s of continuous speech.
 * - We restart automatically on each onEndOfSpeech / onError, accumulating segments.
 * - Each confirmed result is appended to the running transcript.
 * - Partial results update the "live" portion shown in the UI.
 */
class TranscriptionManager(private val context: Context) {

    companion object {
        private const val TAG = "TranscriptionManager"
        private const val LOCALE_CA_FR = "fr-CA"
    }

    private var recognizer: SpeechRecognizer? = null
    private val _transcript = MutableStateFlow("")
    val transcript: StateFlow<String> get() = _transcript

    private val _partialText = MutableStateFlow("")
    val partialText: StateFlow<String> get() = _partialText

    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> get() = _isListening

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> get() = _error

    private var accumulatedText = StringBuilder()
    private var autoRestart = false
    private var sessionActive = false

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun start() {
        if (!isAvailable()) {
            _error.value = "La reconnaissance vocale n'est pas disponible sur cet appareil."
            return
        }
        sessionActive = true
        autoRestart = true
        accumulatedText.clear()
        _transcript.value = ""
        _partialText.value = ""
        _error.value = null
        startNewSession()
    }

    fun stop() {
        autoRestart = false
        sessionActive = false
        recognizer?.stopListening()
        recognizer?.destroy()
        recognizer = null
        _isListening.value = false
        _partialText.value = ""
    }

    fun appendManualText(text: String) {
        if (text.isNotBlank()) {
            if (accumulatedText.isNotEmpty()) accumulatedText.append(" ")
            accumulatedText.append(text.trim())
            _transcript.value = accumulatedText.toString()
        }
    }

    fun clearTranscript() {
        accumulatedText.clear()
        _transcript.value = ""
        _partialText.value = ""
    }

    private fun startNewSession() {
        if (!sessionActive) return
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer?.setRecognitionListener(listener)
        recognizer?.startListening(buildIntent())
        _isListening.value = true
        Log.d(TAG, "Recognition session started")
    }

    private fun buildIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, LOCALE_CA_FR)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, LOCALE_CA_FR)
        putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, LOCALE_CA_FR)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        // Allow longer pauses between speech
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            _error.value = null
            Log.d(TAG, "Ready for speech")
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "Speech detected")
        }

        override fun onRmsChanged(rmsdB: Float) {}

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            _isListening.value = false
            Log.d(TAG, "End of speech segment")
        }

        override fun onError(error: Int) {
            _isListening.value = false
            val msg = errorMessage(error)
            Log.w(TAG, "Recognition error $error: $msg")

            // Non-fatal errors — just restart
            val isFatal = error == SpeechRecognizer.ERROR_CLIENT ||
                    error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS

            if (autoRestart && !isFatal) {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    startNewSession()
                }, 300L)
            } else if (isFatal) {
                _error.value = msg
            }
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull()?.trim() ?: ""
            if (text.isNotEmpty()) {
                if (accumulatedText.isNotEmpty()) accumulatedText.append(" ")
                accumulatedText.append(text)
                _transcript.value = accumulatedText.toString()
                Log.d(TAG, "Result: $text")
            }
            _partialText.value = ""

            // Automatically restart for continuous transcription
            if (autoRestart) {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    startNewSession()
                }, 100L)
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val partial = matches?.firstOrNull()?.trim() ?: ""
            _partialText.value = partial
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun errorMessage(code: Int) = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "Erreur audio"
        SpeechRecognizer.ERROR_CLIENT -> "Erreur client"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Permissions insuffisantes"
        SpeechRecognizer.ERROR_NETWORK -> "Erreur réseau"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Délai réseau dépassé"
        SpeechRecognizer.ERROR_NO_MATCH -> "Aucune correspondance"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Reconnaissseur occupé"
        SpeechRecognizer.ERROR_SERVER -> "Erreur serveur"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Délai de parole dépassé"
        else -> "Erreur inconnue ($code)"
    }
}
