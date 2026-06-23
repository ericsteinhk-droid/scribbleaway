package com.scribbleaway.meetingrecorder.minutes

import android.util.Log
import com.google.gson.Gson
import com.scribbleaway.meetingrecorder.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

data class ClaudeMessage(val role: String, val content: String)
data class ClaudeRequest(
    val model: String,
    val max_tokens: Int,
    val messages: List<ClaudeMessage>
)
data class ClaudeContent(val type: String, val text: String)
data class ClaudeResponse(val content: List<ClaudeContent>)

class MinutesGenerator {

    companion object {
        private const val TAG = "MinutesGenerator"
        private const val API_URL = "https://api.anthropic.com/v1/messages"
        private const val MODEL = "claude-sonnet-4-6"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    /**
     * Generate structured meeting minutes from a transcription.
     *
     * @param transcription  Full meeting transcription text
     * @param contextText    Optional context/agenda uploaded by user
     * @param participantCount Number of participants
     * @param durationMinutes Approximate meeting duration
     * @return Generated meeting minutes in Markdown format
     */
    suspend fun generate(
        transcription: String,
        contextText: String?,
        participantCount: Int,
        durationMinutes: Long
    ): Result<String> = withContext(Dispatchers.IO) {
        val apiKey = BuildConfig.CLAUDE_API_KEY
        if (apiKey.isBlank()) {
            return@withContext Result.failure(
                IllegalStateException("Clé API Claude non configurée. Ajoutez CLAUDE_API_KEY dans local.properties.")
            )
        }

        val systemPrompt = buildSystemPrompt()
        val userPrompt = buildUserPrompt(transcription, contextText, participantCount, durationMinutes)

        val requestBody = gson.toJson(
            ClaudeRequest(
                model = MODEL,
                max_tokens = 4096,
                messages = listOf(
                    ClaudeMessage("user", "$systemPrompt\n\n$userPrompt")
                )
            )
        ).toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(API_URL)
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("content-type", "application/json")
            .post(requestBody)
            .build()

        try {
            val response = client.newCall(request).execute()
            val bodyStr = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                Log.e(TAG, "API error ${response.code}: $bodyStr")
                return@withContext Result.failure(IOException("Erreur API: ${response.code}"))
            }
            val claudeResponse = gson.fromJson(bodyStr, ClaudeResponse::class.java)
            val minutes = claudeResponse.content.firstOrNull { it.type == "text" }?.text
                ?: return@withContext Result.failure(IOException("Réponse vide de l'API"))

            Result.success(minutes)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate minutes", e)
            Result.failure(e)
        }
    }

    private fun buildSystemPrompt() = """
        Tu es un assistant expert en rédaction de comptes rendus de réunion en français canadien.
        Tu rédiges des procès-verbaux clairs, structurés et professionnels.
        Tu utilises un langage formel adapté au contexte professionnel québécois.
        Tu identifies les points de décision, les actions à entreprendre et les responsables.
        Tu préserves le sens exact des échanges sans inventer d'informations absentes de la transcription.
    """.trimIndent()

    private fun buildUserPrompt(
        transcription: String,
        contextText: String?,
        participantCount: Int,
        durationMinutes: Long
    ): String {
        val contextSection = if (!contextText.isNullOrBlank()) {
            """
            ## Contexte et ordre du jour fournis :
            $contextText

            """.trimIndent()
        } else ""

        return """
            $contextSection
            ## Informations sur la réunion :
            - Nombre de participants : $participantCount
            - Durée approximative : $durationMinutes minutes
            - Langue : Français canadien

            ## Transcription complète :
            $transcription

            ## Instructions :
            Génère un compte rendu de réunion complet et structuré en français canadien comprenant :

            1. **En-tête** : Date, durée, nombre de participants
            2. **Résumé exécutif** (3-5 phrases) : Les points essentiels de la réunion
            3. **Points discutés** : Liste structurée des sujets abordés avec leurs points clés
            4. **Décisions prises** : Liste numérotée de toutes les décisions arrêtées
            5. **Actions à entreprendre** : Tableau avec colonnes Action | Responsable | Échéance
            6. **Prochaines étapes** : Ce qui doit se passer avant la prochaine réunion
            7. **Notes additionnelles** : Toute information importante ne rentrant pas dans les catégories précédentes

            Utilise le format Markdown. Sois précis, concis et professionnel.
        """.trimIndent()
    }
}
