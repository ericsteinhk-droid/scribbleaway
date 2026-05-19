package com.scribbleaway.meetingrecorder.repository

import com.google.gson.Gson
import com.scribbleaway.meetingrecorder.db.ChunkDao
import com.scribbleaway.meetingrecorder.db.MeetingDao
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
            throw RuntimeException("Transcription échouée. Vérifiez votre clé API AssemblyAI dans Paramètres. Détail: $detail")
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

    suspend fun deleteMeeting(meeting: Meeting) {
        chunkDao.deleteForMeeting(meeting.id)
        meetingDao.delete(meeting)
    }

    suspend fun deleteMeetingById(id: Long) {
        chunkDao.deleteForMeeting(id)
        meetingDao.deleteById(id)
    }
}
