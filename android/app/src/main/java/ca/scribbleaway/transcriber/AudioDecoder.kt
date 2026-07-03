package ca.scribbleaway.transcriber

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Decodes an arbitrary audio file (mp3, m4a/aac, wav, ogg/opus, flac, …) into
 * the format Whisper expects: 16 kHz, mono, 32-bit float PCM in [-1, 1].
 *
 * Uses the platform [MediaExtractor] + [MediaCodec], so any codec the device
 * itself can play is supported — nothing extra is bundled.
 */
object AudioDecoder {

    private const val TAG = "AudioDecoder"
    const val TARGET_SAMPLE_RATE = 16_000
    private const val TIMEOUT_US = 10_000L

    /** @param progress optional 0f..1f callback based on decoded presentation time. */
    fun decodeToMonoFloat(
        context: Context,
        uri: Uri,
        progress: ((Float) -> Unit)? = null,
    ): FloatArray {
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            context.contentResolver.openAssetFileDescriptor(uri, "r").use { afd ->
                requireNotNull(afd) { "Cannot open audio file" }
                extractor.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            }

            val trackIndex = selectAudioTrack(extractor)
            require(trackIndex >= 0) { "No audio track found in this file" }
            extractor.selectTrack(trackIndex)

            val inputFormat = extractor.getTrackFormat(trackIndex)
            val mime = inputFormat.getString(MediaFormat.KEY_MIME)
                ?: throw IllegalStateException("Audio track has no MIME type")
            var sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channelCount = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            val durationUs = if (inputFormat.containsKey(MediaFormat.KEY_DURATION))
                inputFormat.getLong(MediaFormat.KEY_DURATION) else 0L

            Log.d(TAG, "Decoding $mime  ${sampleRate}Hz  ${channelCount}ch")

            codec = MediaCodec.createDecoderByType(mime).also {
                it.configure(inputFormat, null, null, 0)
                it.start()
            }

            val mono = GrowableFloatBuffer()
            val bufferInfo = MediaCodec.BufferInfo()
            var sawInputEos = false
            var sawOutputEos = false

            while (!sawOutputEos) {
                if (!sawInputEos) {
                    val inIndex = codec.dequeueInputBuffer(TIMEOUT_US)
                    if (inIndex >= 0) {
                        val inputBuffer = codec.getInputBuffer(inIndex)!!
                        val sampleSize = extractor.readSampleData(inputBuffer, 0)
                        if (sampleSize < 0) {
                            codec.queueInputBuffer(
                                inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                            )
                            sawInputEos = true
                        } else {
                            codec.queueInputBuffer(
                                inIndex, 0, sampleSize, extractor.sampleTime, 0
                            )
                            extractor.advance()
                        }
                    }
                }

                when (val outIndex = codec.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val newFormat = codec.outputFormat
                        sampleRate = newFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channelCount = newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        Log.d(TAG, "Output format: ${sampleRate}Hz ${channelCount}ch")
                    }
                    MediaCodec.INFO_TRY_AGAIN_LATER -> { /* keep looping */ }
                    else -> if (outIndex >= 0) {
                        val outBuffer = codec.getOutputBuffer(outIndex)
                        val pcmEncoding = pcmEncodingOf(codec.outputFormat)
                        if (outBuffer != null && bufferInfo.size > 0) {
                            outBuffer.position(bufferInfo.offset)
                            outBuffer.limit(bufferInfo.offset + bufferInfo.size)
                            appendMono(outBuffer, channelCount, pcmEncoding, mono)
                        }
                        codec.releaseOutputBuffer(outIndex, false)

                        if (progress != null && durationUs > 0) {
                            progress((bufferInfo.presentationTimeUs.toFloat() / durationUs)
                                .coerceIn(0f, 1f))
                        }
                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                            sawOutputEos = true
                        }
                    }
                }
            }

            val monoSamples = mono.toArray()
            require(monoSamples.isNotEmpty()) { "No audio samples decoded" }
            return resample(monoSamples, sampleRate, TARGET_SAMPLE_RATE)
        } finally {
            try { codec?.stop() } catch (_: Exception) {}
            try { codec?.release() } catch (_: Exception) {}
            extractor.release()
        }
    }

    private fun selectAudioTrack(extractor: MediaExtractor): Int {
        for (i in 0 until extractor.trackCount) {
            val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME)
            if (mime?.startsWith("audio/") == true) return i
        }
        return -1
    }

    private fun pcmEncodingOf(format: MediaFormat): Int =
        if (format.containsKey(MediaFormat.KEY_PCM_ENCODING))
            format.getInteger(MediaFormat.KEY_PCM_ENCODING)
        else
            android.media.AudioFormat.ENCODING_PCM_16BIT

    /** Downmix the interleaved PCM chunk to mono float and append to [out]. */
    private fun appendMono(
        buffer: ByteBuffer,
        channelCount: Int,
        pcmEncoding: Int,
        out: GrowableFloatBuffer,
    ) {
        buffer.order(ByteOrder.nativeOrder())
        val ch = channelCount.coerceAtLeast(1)
        when (pcmEncoding) {
            android.media.AudioFormat.ENCODING_PCM_FLOAT -> {
                val fb = buffer.asFloatBuffer()
                val frames = fb.remaining() / ch
                for (f in 0 until frames) {
                    var sum = 0f
                    for (c in 0 until ch) sum += fb.get()
                    out.add(sum / ch)
                }
            }
            android.media.AudioFormat.ENCODING_PCM_8BIT -> {
                val frames = buffer.remaining() / ch
                for (f in 0 until frames) {
                    var sum = 0f
                    for (c in 0 until ch) sum += ((buffer.get().toInt() and 0xFF) - 128) / 128f
                    out.add(sum / ch)
                }
            }
            else -> { // ENCODING_PCM_16BIT
                val sb = buffer.asShortBuffer()
                val frames = sb.remaining() / ch
                for (f in 0 until frames) {
                    var sum = 0f
                    for (c in 0 until ch) sum += sb.get() / 32768f
                    out.add(sum / ch)
                }
            }
        }
    }

    /** Linear-interpolation resampler. Adequate for speech going into Whisper. */
    private fun resample(input: FloatArray, srcRate: Int, dstRate: Int): FloatArray {
        if (srcRate == dstRate) return input
        val outLength = ((input.size.toLong() * dstRate) / srcRate).toInt()
        if (outLength <= 0) return FloatArray(0)
        val output = FloatArray(outLength)
        val ratio = srcRate.toDouble() / dstRate.toDouble()
        for (i in 0 until outLength) {
            val srcPos = i * ratio
            val idx = srcPos.toInt()
            val frac = (srcPos - idx).toFloat()
            val a = input[idx]
            val b = if (idx + 1 < input.size) input[idx + 1] else a
            output[i] = a + (b - a) * frac
        }
        return output
    }
}

/** Amortised-growth float buffer to avoid per-sample ArrayList<Float> boxing. */
private class GrowableFloatBuffer(initialCapacity: Int = 1 shl 16) {
    private var buf = FloatArray(initialCapacity)
    private var size = 0

    fun add(value: Float) {
        if (size == buf.size) buf = buf.copyOf(buf.size * 2)
        buf[size++] = value
    }

    fun toArray(): FloatArray = buf.copyOf(size)
}
