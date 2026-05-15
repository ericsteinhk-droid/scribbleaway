package com.scribbleaway.meetingrecorder.summary

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.scribbleaway.meetingrecorder.api.ChatMessage
import com.scribbleaway.meetingrecorder.api.ChatRequest
import com.scribbleaway.meetingrecorder.api.ResponseFormat
import com.scribbleaway.meetingrecorder.model.ActionItem
import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.PointDiscute
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.network.OpenAiClient
import com.scribbleaway.meetingrecorder.util.formatTimestamp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SummaryService(private val client: OpenAiClient) {

    private val gson = Gson()

    suspend fun summarize(segments: List<TranscriptSegment>): MeetingSummary {
        val transcriptText = segments.joinToString("\n") { seg ->
            "[${formatTimestamp(seg.startSeconds)}] ${seg.speaker}: ${seg.text}"
        }

        val request = ChatRequest(
            model = "gpt-4o",
            messages = listOf(
                ChatMessage("system", SYSTEM_PROMPT),
                ChatMessage("user", buildUserPrompt(transcriptText))
            ),
            temperature = 0.3,
            maxTokens = 4096,
            responseFormat = ResponseFormat("json_object")
        )

        return runCatching {
            val response = withContext(Dispatchers.IO) { client.chatCompletion(request) }
            val content = response.choices.firstOrNull()?.message?.content
                ?: return@runCatching defaultSummary()
            parseResponse(content)
        }.getOrElse { defaultSummary() }
    }

    private fun parseResponse(json: String): MeetingSummary {
        val type = object : TypeToken<Map<String, Any>>() {}.type
        val map: Map<String, Any> = gson.fromJson(json, type)

        val resumeExecutif = map["resume_executif"] as? String ?: ""

        val pointsDiscutes = (map["points_discutes"] as? List<*>)?.mapNotNull { item ->
            val m = item as? Map<*, *> ?: return@mapNotNull null
            PointDiscute(
                timestamp = m["timestamp"] as? String ?: "",
                sujet = m["sujet"] as? String ?: "",
                details = m["details"] as? String ?: ""
            )
        } ?: emptyList()

        val decisions = (map["decisions"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()

        val actions = (map["actions"] as? List<*>)?.mapNotNull { item ->
            val m = item as? Map<*, *> ?: return@mapNotNull null
            ActionItem(
                action = m["action"] as? String ?: "",
                responsable = m["responsable"] as? String ?: "À déterminer",
                echeance = m["echeance"] as? String ?: ""
            )
        } ?: emptyList()

        val pointsEnSuspens = (map["points_en_suspens"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()

        return MeetingSummary(resumeExecutif, pointsDiscutes, decisions, actions, pointsEnSuspens)
    }

    private fun defaultSummary() = MeetingSummary(
        resumeExecutif = "Résumé non disponible.",
        pointsDiscutes = emptyList(),
        decisions = emptyList(),
        actions = emptyList(),
        pointsEnSuspens = emptyList()
    )

    private fun buildUserPrompt(transcript: String) = """
Voici la transcription complète d'une réunion de chantier.
Génère un résumé structuré détaillé en français québécois professionnel.

Retourne exactement ce JSON (respecte ces clés):
{
  "resume_executif": "3 à 5 paragraphes résumant la réunion",
  "points_discutes": [
    {"timestamp": "HH:MM", "sujet": "titre court", "details": "description détaillée"}
  ],
  "decisions": ["décision 1", "décision 2"],
  "actions": [
    {"action": "description", "responsable": "nom/rôle", "echeance": "date ou délai"}
  ],
  "points_en_suspens": ["point 1", "point 2"]
}

Transcription:
$transcript
""".trimIndent()

    companion object {
        private const val SYSTEM_PROMPT = """Tu es expert en rédaction de comptes rendus de réunions de chantier de construction
au Québec. Tu rédiges en français québécois professionnel et formel.

Lexique du projet (termes techniques à utiliser correctement):
MATÉRIAUX: béton, bloc de béton, maçonnerie, terracotta, gypse, gypse laminé, plâtre, peinture,
tôle, quartz, scellant, silicone, plinthes, moulures, cadre de porte, porte métallique,
quincaillerie de porte, ferme-porte, manchon, conduit électrique, conduit de ventilation,
tuyauterie, gicleur, détecteur de fumée, drain de plancher, tuile de plafond, coffrage,
colombage, linteau, fourrure, ignifuge.

ACTIVITÉS: démolition, découpe, percement, étaiement, coffrage, coulée de béton,
installation de cloisons, pose de gypse, installation électrique, plomberie, ventilation,
coordination, relocalisation, plâtrage, peinture, scellement, finition, inspection,
surveillance de chantier, vérification coupe-feu, délestage, filage électrique, mise en cure,
réparation, installation d'ancrages.

ACRONYMES: DDC (document de coordination), DIR (directive), QRT (question/réponse technique),
NDLR (note de la rédaction), UdeM (Université de Montréal), POM, CVAC (chauffage-ventilation-
climatisation), CF (coupe-feu), T&M (temps et matériaux), ATK, BX."""
    }
}
