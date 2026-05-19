package com.scribbleaway.meetingrecorder.repository

import com.scribbleaway.meetingrecorder.db.ChunkDao
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.network.AssemblyAiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class TranscriptionRepository(
    private val client: AssemblyAiClient,
    private val chunkDao: ChunkDao
) {
    suspend fun transcribeChunk(chunk: Chunk, speakersExpected: Int): List<TranscriptSegment> {
        val file = File(chunk.filePath)
        val segments = withContext(Dispatchers.IO) {
            client.transcribe(file, speakersExpected, chunk.offsetSeconds)
        }
        val rawText = segments.joinToString(" ") { it.text }
        chunkDao.update(chunk.copy(rawTranscript = rawText, processed = true))
        return segments
    }
}
