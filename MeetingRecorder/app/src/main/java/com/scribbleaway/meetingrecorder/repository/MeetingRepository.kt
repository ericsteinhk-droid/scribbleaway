package com.scribbleaway.meetingrecorder.repository

import com.google.gson.Gson
import com.scribbleaway.meetingrecorder.db.ChunkDao
import com.scribbleaway.meetingrecorder.db.MeetingDao
import com.scribbleaway.meetingrecorder.diarization.DiarizationService
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.model.Meeting
import com.scribbleaway.meetingrecorder.model.MeetingStatus
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.summary.SummaryService
import kotlinx.coroutines.flow.Flow

class MeetingRepository(
    private val meetingDao: MeetingDao,
    private val chunkDao: ChunkDao,
    private val transcriptionRepo: TranscriptionRepository,
    private val diarizationService: DiarizationService,
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

        val allSegments = mutableListOf<com.scribbleaway.meetingrecorder.api.WhisperSegment>()
        val transcriptionErrors = mutableListOf<String>()

        chunks.forEachIndexed { i, chunk ->
            onProgress("Transcription du fichier ${i + 1}/${chunks.size}…")
            runCatching { transcriptionRepo.transcribeChunk(chunk) }
                .onSuccess { result -> allSegments.addAll(result.segments) }
                .onFailure { error -> transcriptionErrors.add("Fichier ${i + 1}: ${error.message}") }
        }

        if (allSegments.isEmpty()) {
            meetingDao.updateStatus(meetingId, MeetingStatus.ERROR)
            val detail = transcriptionErrors.joinToString("; ")
            throw RuntimeException("Transcription échouée. Vérifiez votre clé API OpenAI dans Paramètres. Détail: $detail")
        }

        onProgress("Identification des intervenants…")
        val diarized = runCatching {
            diarizationService.diarize(allSegments, expectedSpeakers)
        }.getOrElse {
            allSegments.map { TranscriptSegment("Intervenant", it.start, it.end, it.text) }
        }

        onProgress("Génération du résumé…")
        val summary = runCatching {
            summaryService.summarize(diarized)
        }.onFailure { error ->
            onProgress("Avertissement résumé: ${error.message}")
        }.getOrNull()

        val transcriptJson = gson.toJson(diarized)
        val summaryJson = if (summary != null) gson.toJson(summary) else ""
        val totalDuration = allSegments.maxOfOrNull { it.end } ?: 0.0

        meetingDao.updateResults(
            id = meetingId,
            transcript = transcriptJson,
            summaryJson = summaryJson,
            status = MeetingStatus.DONE,
            duration = totalDuration
        )
    }

    suspend fun deleteMeeting(meeting: Meeting) {
        chunkDao.deleteForMeeting(meeting.id)
        meetingDao.delete(meeting)
    }
}
