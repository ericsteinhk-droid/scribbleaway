package com.scribbleaway.meetingrecorder.audio

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import kotlinx.coroutines.*
import java.io.File

class ChunkedRecorder(private val context: Context) {

    private var recorder: MediaRecorder? = null
    private var currentFile: File? = null
    private var chunkIndex = 0
    private var chunkOffsetSeconds = 0.0
    private var chunkStartMs = 0L
    private var rotationJob: Job? = null

    private val completedChunks = mutableListOf<ChunkInfo>()

    data class ChunkInfo(val file: File, val index: Int, val offsetSeconds: Double)

    fun start(
        chunkFile: File,
        chunkDurationMs: Long,
        scope: CoroutineScope,
        onChunkReady: (ChunkInfo) -> Unit
    ) {
        chunkIndex = 0
        completedChunks.clear()
        chunkOffsetSeconds = 0.0
        startNewChunk(chunkFile)
        scheduleRotation(chunkDurationMs, scope, onChunkReady)
    }

    fun pause() {
        runCatching { recorder?.pause() }
    }

    fun resume() {
        runCatching { recorder?.resume() }
    }

    fun stop(): List<ChunkInfo> {
        rotationJob?.cancel()
        rotationJob = null
        val elapsedMs = if (chunkStartMs > 0) System.currentTimeMillis() - chunkStartMs else 0L
        stopCurrentRecorder()
        currentFile?.let { file ->
            if (file.exists() && file.length() > 0) {
                completedChunks.add(ChunkInfo(file, chunkIndex, chunkOffsetSeconds))
            }
        }
        chunkOffsetSeconds += elapsedMs / 1000.0
        return completedChunks.toList()
    }

    private fun scheduleRotation(
        chunkDurationMs: Long,
        scope: CoroutineScope,
        onChunkReady: (ChunkInfo) -> Unit
    ) {
        rotationJob = scope.launch {
            delay(chunkDurationMs)
            while (isActive) {
                rotate(onChunkReady)
                delay(chunkDurationMs)
            }
        }
    }

    private fun rotate(onChunkReady: (ChunkInfo) -> Unit) {
        val elapsedMs = System.currentTimeMillis() - chunkStartMs
        stopCurrentRecorder()
        currentFile?.let { file ->
            val info = ChunkInfo(file, chunkIndex, chunkOffsetSeconds)
            completedChunks.add(info)
            onChunkReady(info)
        }
        chunkOffsetSeconds += elapsedMs / 1000.0
        chunkIndex++
        val nextFile = File(currentFile!!.parent, "chunk_$chunkIndex.m4a")
        startNewChunk(nextFile)
    }

    private fun startNewChunk(file: File) {
        currentFile = file
        chunkStartMs = System.currentTimeMillis()
        recorder = createRecorder().also { r ->
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(44100)
            r.setAudioChannels(1)
            r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(file.absolutePath)
            runCatching {
                r.prepare()
                r.start()
            }
        }
    }

    private fun stopCurrentRecorder() {
        runCatching {
            recorder?.stop()
            recorder?.release()
        }
        recorder = null
    }

    private fun createRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            MediaRecorder(context)
        else
            @Suppress("DEPRECATION") MediaRecorder()
}
