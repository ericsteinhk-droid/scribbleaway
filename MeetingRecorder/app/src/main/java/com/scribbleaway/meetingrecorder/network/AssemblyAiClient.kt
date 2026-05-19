package com.scribbleaway.meetingrecorder.network

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

class AssemblyAiClient(private val apiKeyProvider: () -> String) {

    private val gson = Gson()

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(300, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    // ── Request / response models ─────────────────────────────────────────

    private data class UploadResponse(@SerializedName("upload_url") val uploadUrl: String)

    private data class TranscriptRequest(
        @SerializedName("audio_url") val audioUrl: String,
        @SerializedName("language_code") val languageCode: String = "fr",
        @SerializedName("speaker_labels") val speakerLabels: Boolean = true,
        @SerializedName("speakers_expected") val speakersExpected: Int,
        @SerializedName("speech_model") val speechModel: String = "best",
        @SerializedName("word_boost") val wordBoost: List<String> = WORD_BOOST,
        @SerializedName("boost_param") val boostParam: String = "high"
    )

    private data class IdResponse(val id: String)

    private data class TranscriptResponse(
        val id: String,
        val status: String,
        val text: String?,
        val utterances: List<Utterance>?,
        val error: String?
    )

    private data class Utterance(
        val speaker: String,
        val start: Long,   // milliseconds
        val end: Long,     // milliseconds
        val text: String
    )

    // ── Public API ────────────────────────────────────────────────────────

    fun transcribe(file: File, speakersExpected: Int, offsetSeconds: Double): List<TranscriptSegment> {
        val key = apiKeyProvider()
        if (key.isBlank()) throw RuntimeException(
            "Clé API AssemblyAI non configurée. Veuillez l'ajouter dans Paramètres."
        )
        val uploadUrl = uploadAudio(file, key)
        val transcriptId = requestTranscript(uploadUrl, speakersExpected, key)
        return pollForResult(transcriptId, offsetSeconds, key)
    }

    // ── Private steps ─────────────────────────────────────────────────────

    private fun uploadAudio(file: File, key: String): String {
        val reqBody = file.asRequestBody("application/octet-stream".toMediaType())
        val request = Request.Builder()
            .url("https://api.assemblyai.com/v2/upload")
            .header("Authorization", key)
            .post(reqBody)
            .build()
        http.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: throw RuntimeException("Réponse upload AssemblyAI vide")
            if (!response.isSuccessful) throw RuntimeException("Erreur upload AssemblyAI ${response.code}: $body")
            return gson.fromJson(body, UploadResponse::class.java).uploadUrl
        }
    }

    private fun requestTranscript(audioUrl: String, speakersExpected: Int, key: String): String {
        val body = TranscriptRequest(audioUrl = audioUrl, speakersExpected = speakersExpected)
        val reqBody = gson.toJson(body).toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("https://api.assemblyai.com/v2/transcript")
            .header("Authorization", key)
            .header("Content-Type", "application/json")
            .post(reqBody)
            .build()
        http.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw RuntimeException("Réponse transcript AssemblyAI vide")
            if (!response.isSuccessful) throw RuntimeException("Erreur AssemblyAI ${response.code}: $bodyStr")
            return gson.fromJson(bodyStr, IdResponse::class.java).id
        }
    }

    private fun pollForResult(id: String, offsetSeconds: Double, key: String): List<TranscriptSegment> {
        val pollRequest = Request.Builder()
            .url("https://api.assemblyai.com/v2/transcript/$id")
            .header("Authorization", key)
            .get()
            .build()

        val maxWaitMs = 10 * 60 * 1000L
        val startMs = System.currentTimeMillis()
        Thread.sleep(5_000) // give AssemblyAI a moment before first poll

        while (System.currentTimeMillis() - startMs < maxWaitMs) {
            val result = http.newCall(pollRequest).execute().use { response ->
                val bodyStr = response.body?.string() ?: throw RuntimeException("Réponse poll AssemblyAI vide")
                if (!response.isSuccessful) throw RuntimeException("Erreur poll ${response.code}: $bodyStr")
                gson.fromJson(bodyStr, TranscriptResponse::class.java)
            }
            when (result.status) {
                "completed" -> return result.toSegments(offsetSeconds)
                "error" -> throw RuntimeException("Erreur transcription AssemblyAI : ${result.error}")
                else -> Thread.sleep(5_000)
            }
        }
        throw RuntimeException("Délai dépassé — AssemblyAI n'a pas répondu dans les 10 minutes")
    }

    private fun TranscriptResponse.toSegments(offsetSeconds: Double): List<TranscriptSegment> {
        val utts = utterances
        if (!utts.isNullOrEmpty()) {
            return utts.map { u ->
                TranscriptSegment(
                    speaker = "Intervenant ${u.speaker}",
                    startSeconds = u.start / 1000.0 + offsetSeconds,
                    endSeconds = u.end / 1000.0 + offsetSeconds,
                    text = u.text.trim()
                )
            }
        }
        // Fallback: no speaker labels returned — single block
        return listOf(TranscriptSegment(
            speaker = "Intervenant",
            startSeconds = offsetSeconds,
            endSeconds = offsetSeconds + (text?.length?.div(15.0) ?: 60.0),
            text = text?.trim() ?: ""
        ))
    }

    companion object {
        private val WORD_BOOST = listOf(
            "DDC", "DIR", "QRT", "NDLR", "UdeM", "POM", "CVAC", "ATK", "BX",
            "béton", "coffrage", "maçonnerie", "terracotta", "gypse", "ignifuge",
            "gicleur", "ferme-porte", "scellant", "silicone", "colombage", "linteau",
            "fourrure", "étaiement", "délestage", "tuyauterie"
        )
    }
}
