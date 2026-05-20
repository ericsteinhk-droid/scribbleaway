package com.scribbleaway.meetingrecorder.repository

import com.scribbleaway.meetingrecorder.db.ChunkDao
import com.scribbleaway.meetingrecorder.diarization.DiarizationService
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.network.OpenAiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class TranscriptionRepository(
    private val client: OpenAiClient,
    private val diarizationService: DiarizationService,
    private val chunkDao: ChunkDao
) {
    suspend fun transcribeChunk(chunk: Chunk, speakersExpected: Int): List<TranscriptSegment> {
        val file = File(chunk.filePath)
        val whisperResponse = withContext(Dispatchers.IO) {
            client.transcribeAudio(file, prompt = "Réunion de chantier en français québécois.")
        }
        val rawText = whisperResponse.segments?.joinToString(" ") { it.text.trim() }
            ?: whisperResponse.text.orEmpty()
        chunkDao.update(chunk.copy(rawTranscript = rawText, processed = true))

        val segments = whisperResponse.segments ?: return listOf(
            TranscriptSegment(
                speaker = "Intervenant",
                startSeconds = chunk.offsetSeconds,
                endSeconds = chunk.offsetSeconds + 60.0,
                text = rawText.trim()
            )
        )

        val offsetted = segments.map { it.copy(start = it.start + chunk.offsetSeconds, end = it.end + chunk.offsetSeconds) }
        return diarizationService.diarize(offsetted, speakersExpected)
    }
}
