package com.evoq.fieldrecorder

import java.nio.ByteBuffer
import java.nio.ByteOrder

object WavUtils {
    fun pcmToWav(pcm: ByteArray, sampleRate: Int = 16000): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val wav = ByteArray(44 + pcm.size)
        ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray())
            putInt(36 + pcm.size)
            put("WAVE".toByteArray())
            put("fmt ".toByteArray())
            putInt(16)
            putShort(1)
            putShort(channels.toShort())
            putInt(sampleRate)
            putInt(byteRate)
            putShort(blockAlign.toShort())
            putShort(bitsPerSample.toShort())
            put("data".toByteArray())
            putInt(pcm.size)
            put(pcm)
        }
        return wav
    }
}
