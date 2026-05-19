package com.scribbleaway.meetingrecorder.summary

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.scribbleaway.meetingrecorder.model.ActionItem
import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.PointDiscute
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.network.AnthropicClient
import com.scribbleaway.meetingrecorder.util.formatTimestamp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SummaryService(private val client: AnthropicClient) {

    private val gson = Gson()

    suspend fun summarize(segments: List<TranscriptSegment>): MeetingSummary {
        val transcriptText = segments.joinToString("\n") { seg ->
            "[${formatTimestamp(seg.startSeconds)}] ${seg.speaker}: ${seg.text}"
        }

        return runCatching {
            val content = withContext(Dispatchers.IO) {
                client.complete(
                    system = SYSTEM_PROMPT,
                    userMessage = buildUserPrompt(transcriptText),
                    temperature = 0.2,
                    maxTokens = 4096
                )
            }
            parseResponse(content)
        }.getOrElse { error ->
            val reason = when {
                error.message?.contains("non configurée") == true ->
                    "[Résumé non disponible — clé API Anthropic manquante. Veuillez l'ajouter dans Paramètres.]"
                error.message != null ->
                    "[Résumé non disponible — ${error.message}]"
                else ->
                    "[Résumé non disponible — erreur inconnue]"
            }
            MeetingSummary(
                resumeExecutif = reason,
                pointsDiscutes = emptyList(),
                decisions = emptyList(),
                actions = emptyList(),
                pointsEnSuspens = emptyList()
            )
        }
    }

    private fun parseResponse(json: String): MeetingSummary {
        val cleaned = json.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        val type = object : TypeToken<Map<String, Any>>() {}.type
        val map: Map<String, Any> = gson.fromJson(cleaned, type)

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
                responsable = m["responsable"] as? String ?: "[responsable non mentionné]",
                echeance = m["echeance"] as? String ?: "[échéance non précisée]"
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
Voici la transcription d'une réunion de chantier. Génère un résumé structuré en français québécois professionnel.

RÈGLES D'EXACTITUDE — à respecter impérativement :
- Ne rédige que ce qui est clairement exprimé dans la transcription.
- Si une information est absente, ambiguë ou de faible certitude, indique-le entre crochets dans le texte,
  par exemple : [information non précisée], [nom non mentionné], [date à confirmer], [propos peu audible],
  [interprétation incertaine — vérifier].
- N'invente aucun chiffre, date, nom, décision ou engagement qui n'apparaît pas dans la transcription.
- Si la transcription est trop courte ou trop fragmentée pour rédiger une section, indique
  [information insuffisante pour cette section].
- Pour les actions : si le responsable n'est pas nommé, écris [responsable non mentionné].
  Si l'échéance n'est pas précisée, écris [échéance non précisée].

Retourne uniquement le JSON suivant, sans balises markdown ni texte supplémentaire :
{
  "resume_executif": "3 à 5 paragraphes résumant fidèlement la réunion, avec caveats entre crochets si nécessaire",
  "points_discutes": [
    {"timestamp": "HH:MM", "sujet": "titre court", "details": "description avec caveats si besoin"}
  ],
  "decisions": ["décision telle qu'exprimée, avec [caveat] si incertaine"],
  "actions": [
    {"action": "description précise", "responsable": "nom ou rôle, ou [responsable non mentionné]", "echeance": "date/délai ou [échéance non précisée]"}
  ],
  "points_en_suspens": ["point en suspens ou question sans réponse claire"]
}

Transcription :
$transcript
""".trimIndent()

    companion object {
        private const val SYSTEM_PROMPT = """Tu es expert en rédaction de comptes rendus de réunions de chantier de construction
au Québec. Tu rédiges en français québécois professionnel et formel.

TON RÔLE EST DE RAPPORTER FIDÈLEMENT, PAS D'INTERPRÉTER.
- Restitue uniquement ce qui a été dit explicitement.
- Lorsqu'un propos est flou, incomplet ou potentiellement mal transcrit, signale-le entre crochets :
  [propos peu audible], [terme incertain], [information à vérifier].
- Ne complète jamais une information manquante par conjecture ou par déduction.
- La précision et l'honnêteté intellectuelle ont priorité sur la fluidité du texte.
- Réponds uniquement avec le JSON demandé, sans aucun texte supplémentaire ni balises markdown.

Lexique du projet (termes techniques à reconnaître et utiliser correctement) :
MATÉRIAUX : béton, bloc de béton, maçonnerie, terracotta, gypse, gypse laminé, plâtre, peinture,
tôle, quartz, scellant, silicone, plinthes, moulures, cadre de porte, porte métallique,
quincaillerie de porte, ferme-porte, manchon, conduit électrique, conduit de ventilation,
tuyauterie, gicleur, détecteur de fumée, drain de plancher, tuile de plafond, coffrage,
colombage, linteau, fourrure, ignifuge.

ACTIVITÉS : démolition, découpe, percement, étaiement, coffrage, coulée de béton,
installation de cloisons, pose de gypse, installation électrique, plomberie, ventilation,
coordination, relocalisation, plâtrage, peinture, scellement, finition, inspection,
surveillance de chantier, vérification coupe-feu, délestage, filage électrique, mise en cure,
réparation, installation d'ancrages.

ACRONYMES : DDC (document de coordination), DIR (directive), QRT (question/réponse technique),
NDLR (note de la rédaction), UdeM (Université de Montréal), POM, CVAC (chauffage-ventilation-
climatisation), CF (coupe-feu), T&M (temps et matériaux), ATK, BX."""
    }
}
