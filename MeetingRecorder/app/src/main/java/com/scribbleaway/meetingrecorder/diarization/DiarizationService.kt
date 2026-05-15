package com.scribbleaway.meetingrecorder.diarization

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.scribbleaway.meetingrecorder.api.ChatMessage
import com.scribbleaway.meetingrecorder.api.ChatRequest
import com.scribbleaway.meetingrecorder.api.ResponseFormat
import com.scribbleaway.meetingrecorder.api.WhisperSegment
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.network.OpenAiClient

class DiarizationService(private val client: OpenAiClient) {

    private val gson = Gson()

    /**
     * Takes Whisper segments (with timestamps) and asks GPT-4o to assign
     * speaker labels based on conversational context and construction roles.
     */
    suspend fun diarize(
        segments: List<WhisperSegment>,
        expectedSpeakers: Int
    ): List<TranscriptSegment> {
        if (segments.isEmpty()) return emptyList()

        val segmentsJson = gson.toJson(segments.map {
            mapOf("start" to it.start, "end" to it.end, "text" to it.text.trim())
        })

        val request = ChatRequest(
            model = "gpt-4o",
            messages = listOf(
                ChatMessage("system", SYSTEM_PROMPT),
                ChatMessage("user", buildUserPrompt(segmentsJson, expectedSpeakers))
            ),
            temperature = 0.1,
            maxTokens = 8000,
            responseFormat = ResponseFormat("json_object")
        )

        return runCatching {
            val response = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                client.chatCompletion(request)
            }
            val content = response.choices.firstOrNull()?.message?.content ?: return@runCatching fallback(segments)
            parseResponse(content)
        }.getOrElse { fallback(segments) }
    }

    private fun parseResponse(json: String): List<TranscriptSegment> {
        val type = object : TypeToken<Map<String, List<Map<String, Any>>>>() {}.type
        val map: Map<String, List<Map<String, Any>>> = gson.fromJson(json, type)
        val items = map["segments"] ?: return emptyList()
        return items.map { item ->
            TranscriptSegment(
                speaker = item["speaker"] as? String ?: "Intervenant",
                startSeconds = (item["start"] as? Double) ?: 0.0,
                endSeconds = (item["end"] as? Double) ?: 0.0,
                text = item["text"] as? String ?: ""
            )
        }
    }

    private fun fallback(segments: List<WhisperSegment>): List<TranscriptSegment> =
        segments.map { TranscriptSegment("Intervenant", it.start, it.end, it.text.trim()) }

    private fun buildUserPrompt(segmentsJson: String, expectedSpeakers: Int) = """
Voici les segments d'une réunion de chantier (format JSON: start, end, text en secondes).
Il y a environ $expectedSpeakers intervenants. Analyse le contenu et assigne un locuteur à chaque segment.

Utilise les rôles mentionnés si identifiables (ex: "Gérant de projet", "Architecte", "Surintendant",
"Ingénieur structure", "Entrepreneur général"). Sinon, utilise "Intervenant A", "Intervenant B", etc.

Détecte les changements de locuteur en analysant:
- Questions et réponses
- Changements de perspective ou de responsabilité
- Références à des rôles ou des noms

Retourne un JSON: {"segments": [{"speaker": "...", "start": 0.0, "end": 5.2, "text": "..."}]}

Segments:
$segmentsJson
""".trimIndent()

    companion object {
        private const val SYSTEM_PROMPT = """Tu es expert en analyse de réunions de chantier de construction au Québec.
Tu reçois des transcriptions de réunions en français québécois et tu dois identifier les locuteurs.

Lexique du projet — intervenants possibles:
Architecte directeur du projet, Architecte surveillante de chantier, Chargé de projet,
Gérant de projet, Assistant-gérant de projet, Surintendant, Assistant-surintendant,
Gestionnaire de projet, Coordonnateur réalisation, Surveillant de chantier,
Ingénieur mécanique, Ingénieur électrique, Ingénieur structure,
Entrepreneur général, Sous-traitants spécialisés.

Termes techniques à reconnaître: béton, coffrage, maçonnerie, gypse, colombage, linteau,
CVAC, DDC, DIR, QRT, UdeM, POM, CF, T&M, ATK, BX, gicleur, ignifuge, fourrure, ferme-porte,
terracotta, tôle, quartz, scellant, silicone, conduit électrique, conduit de ventilation,
tuyauterie, détecteur de fumée, drain de plancher, tuile de plafond, étaiement, coulée de béton."""
    }
}
