package com.scribbleaway.meetingrecorder.repository

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.scribbleaway.meetingrecorder.db.ChunkDao
import com.scribbleaway.meetingrecorder.db.MeetingDao
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.model.Meeting
import com.scribbleaway.meetingrecorder.model.MeetingStatus
import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.summary.SummaryService
import com.scribbleaway.meetingrecorder.util.backupToDownloads
import kotlinx.coroutines.flow.Flow
import java.io.File

class MeetingRepository(
    private val context: Context,
    private val meetingDao: MeetingDao,
    private val chunkDao: ChunkDao,
    private val transcriptionRepo: TranscriptionRepository,
    private val summaryService: SummaryService,
    private val gson: Gson
) {
    val allMeetings: Flow<List<Meeting>> = meetingDao.allMeetings()

    suspend fun createMeeting(title: String): Long =
        meetingDao.insert(Meeting(title = title, dateMs = System.currentTimeMillis()))

    suspend fun savePendingChunk(meetingId: Long, chunk: Chunk): Long =
        chunkDao.insert(chunk)

    suspend fun getMeeting(id: Long): Meeting? = meetingDao.getById(id)

    suspend fun processRecording(
        meetingId: Long,
        expectedSpeakers: Int,
        onProgress: (String) -> Unit
    ) {
        meetingDao.updateStatus(meetingId, MeetingStatus.PROCESSING)

        val chunks = chunkDao.getChunksForMeeting(meetingId)
        if (chunks.isEmpty()) {
            meetingDao.updateStatus(meetingId, MeetingStatus.ERROR)
            throw RuntimeException("Aucun fichier audio trouvé. L'enregistrement n'a pas été sauvegardé correctement.")
        }

        // Back up all chunks to Downloads/ScribbleAway/ before touching the network,
        // so the raw audio survives even if transcription fails or the app crashes.
        onProgress("Sauvegarde audio…")
        val meeting = meetingDao.getById(meetingId)
        val safeTitle = meeting?.title
            ?.replace(Regex("[^\\w\\s-]"), "")
            ?.trim()
            ?.replace(' ', '_')
            ?.take(40)
            ?: "reunion"
        chunks.forEach { chunk ->
            backupToDownloads(
                context = context,
                file = File(chunk.filePath),
                folderName = "EVOQ-meet",
                displayName = "${safeTitle}_chunk_${chunk.index}.m4a"
            )
        }

        val allSegments = mutableListOf<TranscriptSegment>()
        val transcriptionErrors = mutableListOf<String>()

        chunks.forEachIndexed { i, chunk ->
            onProgress("Transcription et diarisation — fichier ${i + 1}/${chunks.size}…")
            runCatching { transcriptionRepo.transcribeChunk(chunk, expectedSpeakers) }
                .onSuccess { segments -> allSegments.addAll(segments) }
                .onFailure { error -> transcriptionErrors.add("Fichier ${i + 1}: ${error.message}") }
        }

        if (allSegments.isEmpty()) {
            meetingDao.updateStatus(meetingId, MeetingStatus.ERROR)
            val detail = transcriptionErrors.joinToString("; ")
            val userMessage = when {
                detail.contains("Unable to resolve host") ||
                detail.contains("No address associated") ||
                detail.contains("Network is unreachable") ->
                    "Connexion internet indisponible. Vérifiez votre réseau et réessayez."
                detail.contains("connection abort", ignoreCase = true) ||
                detail.contains("Connection reset", ignoreCase = true) ||
                detail.contains("Connection refused", ignoreCase = true) ->
                    "Connexion interrompue. Vérifiez votre réseau et réessayez."
                detail.contains("401") || detail.contains("Unauthorized") ||
                detail.contains("Incorrect API key") || detail.contains("invalid_api_key") ->
                    "Clé API OpenAI invalide. Vérifiez votre clé dans Paramètres."
                else -> "Transcription échouée. Détail: $detail"
            }
            throw RuntimeException(userMessage)
        }

        onProgress("Génération du résumé…")
        val summary = summaryService.summarize(allSegments)

        val transcriptJson = gson.toJson(allSegments)
        val summaryJson = gson.toJson(summary)
        val totalDuration = allSegments.maxOfOrNull { it.endSeconds } ?: 0.0

        meetingDao.updateResults(
            id = meetingId,
            transcript = transcriptJson,
            summaryJson = summaryJson,
            status = MeetingStatus.DONE,
            duration = totalDuration
        )
    }

    suspend fun retrySummary(meetingId: Long): MeetingSummary {
        val meeting = meetingDao.getById(meetingId)
            ?: throw RuntimeException("Réunion introuvable")
        if (meeting.diarizedTranscript.isBlank())
            throw RuntimeException("Transcription non disponible — impossible de générer le résumé")
        val type = object : TypeToken<List<TranscriptSegment>>() {}.type
        val segments: List<TranscriptSegment> = gson.fromJson(meeting.diarizedTranscript, type)
        val summary = summaryService.summarize(segments)
        meetingDao.updateSummary(meetingId, gson.toJson(summary), MeetingStatus.DONE)
        return summary
    }

    suspend fun deleteMeeting(meeting: Meeting) {
        chunkDao.deleteForMeeting(meeting.id)
        meetingDao.delete(meeting)
    }

    suspend fun deleteMeetingById(id: Long) {
        chunkDao.deleteForMeeting(id)
        meetingDao.deleteById(id)
    }
}
