package com.scribbleaway.meetingrecorder.repository

import com.scribbleaway.meetingrecorder.api.WhisperSegment
import com.scribbleaway.meetingrecorder.db.ChunkDao
import com.scribbleaway.meetingrecorder.model.Chunk
import com.scribbleaway.meetingrecorder.network.OpenAiClient
import java.io.File

private const val WHISPER_PROMPT = "Réunion de chantier à Montréal, Québec. Français québécois. " +
    "Termes: béton, coffrage, maçonnerie, gypse laminé, colombage, linteau, fourrure, ignifuge, " +
    "gicleur, ferme-porte, terracotta, tôle, quartz, scellant, silicone, conduit électrique, " +
    "conduit de ventilation, tuyauterie, drain de plancher, tuile de plafond, étaiement, " +
    "coulée de béton, pose de gypse, délestage, filage électrique, mise en cure, " +
    "DDC, DIR, QRT, NDLR, UdeM, POM, CVAC, CF, T&M, ATK, BX."

class TranscriptionRepository(
    private val client: OpenAiClient,
    private val chunkDao: ChunkDao
) {
    data class ChunkTranscript(val chunkIndex: Int, val offsetSeconds: Double, val segments: List<WhisperSegment>)

    suspend fun transcribeChunk(chunk: Chunk): ChunkTranscript {
        val file = File(chunk.filePath)
        val response = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            client.transcribeAudio(file, WHISPER_PROMPT)
        }
        val rawText = response.text
        chunkDao.update(chunk.copy(rawTranscript = rawText, processed = true))

        // Offset segment timestamps by this chunk's position in the full meeting
        val offsetSegments = response.segments?.map { seg ->
            seg.copy(start = seg.start + chunk.offsetSeconds, end = seg.end + chunk.offsetSeconds)
        } ?: listOf(
            WhisperSegment(0, chunk.offsetSeconds, chunk.offsetSeconds + 1.0, rawText, null, null)
        )

        return ChunkTranscript(chunk.index, chunk.offsetSeconds, offsetSegments)
    }
}
