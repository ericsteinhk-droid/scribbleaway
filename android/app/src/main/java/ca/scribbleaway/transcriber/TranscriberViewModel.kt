package ca.scribbleaway.transcriber

import android.app.Application
import android.net.Uri
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.whispercpp.whisper.WhisperContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "TranscriberVM"
private const val MODEL_ASSET_PATH = "models/ggml-base.bin"

sealed interface UiState {
    data object Idle : UiState
    data class Working(val stage: String, val progress: Float? = null) : UiState
    data class Success(val text: String, val fileName: String?) : UiState
    data class Failure(val message: String) : UiState
}

class TranscriberViewModel(app: Application) : AndroidViewModel(app) {

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    @Volatile private var whisperContext: WhisperContext? = null

    /** Loaded once and reused across files. */
    private suspend fun ensureModel(): WhisperContext {
        whisperContext?.let { return it }
        return withContext(Dispatchers.IO) {
            whisperContext ?: WhisperContext.createContextFromAsset(
                getApplication<Application>().assets, MODEL_ASSET_PATH
            ).also { whisperContext = it }
        }
    }

    fun transcribe(uri: Uri, fileName: String?, withTimestamps: Boolean) {
        viewModelScope.launch {
            try {
                _uiState.value = UiState.Working("Chargement du modèle Whisper…")
                val ctx = ensureModel()

                _uiState.value = UiState.Working("Décodage de l’audio…", 0f)
                val samples = withContext(Dispatchers.IO) {
                    AudioDecoder.decodeToMonoFloat(getApplication(), uri) { p ->
                        _uiState.value = UiState.Working("Décodage de l’audio…", p)
                    }
                }
                val seconds = samples.size / AudioDecoder.TARGET_SAMPLE_RATE
                Log.d(TAG, "Decoded ${samples.size} samples (~${seconds}s)")

                _uiState.value = UiState.Working("Transcription en cours… (${seconds}s d’audio)")
                val text = ctx.transcribeData(samples, withTimestamps = withTimestamps)

                _uiState.value = if (text.isBlank())
                    UiState.Failure("Aucune parole détectée dans ce fichier.")
                else
                    UiState.Success(text, fileName)
            } catch (e: Exception) {
                Log.e(TAG, "Transcription failed", e)
                _uiState.value = UiState.Failure(e.message ?: "Erreur inconnue")
            }
        }
    }

    fun reset() {
        _uiState.value = UiState.Idle
    }

    override fun onCleared() {
        super.onCleared()
        val ctx = whisperContext
        whisperContext = null
        if (ctx != null) {
            viewModelScope.launch { ctx.release() }
        }
    }
}
