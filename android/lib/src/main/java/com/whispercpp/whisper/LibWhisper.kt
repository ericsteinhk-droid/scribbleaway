package com.whispercpp.whisper

import android.content.res.AssetManager
import android.os.Build
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.Executors

private const val LOG_TAG = "LibWhisper"

/** A loaded whisper.cpp model. Not thread-safe: all work is funnelled through a
 *  single-threaded dispatcher, per the whisper.cpp constraint. */
class WhisperContext private constructor(private var ptr: Long) {
    private val scope: CoroutineScope = CoroutineScope(
        Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    )

    /** Transcribe 16 kHz mono float PCM. Returns plain text (segments joined),
     *  optionally prefixed with `[hh:mm:ss.mmm --> hh:mm:ss.mmm]` timestamps. */
    suspend fun transcribeData(data: FloatArray, withTimestamps: Boolean = true): String =
        withContext(scope.coroutineContext) {
            require(ptr != 0L) { "Model has been released" }
            val numThreads = WhisperCpuConfig.preferredThreadCount
            Log.d(LOG_TAG, "Transcribing ${data.size} samples with $numThreads threads")
            WhisperLib.fullTranscribe(ptr, numThreads, data)
            val textCount = WhisperLib.getTextSegmentCount(ptr)
            buildString {
                for (i in 0 until textCount) {
                    val segment = WhisperLib.getTextSegment(ptr, i).trim()
                    if (withTimestamps) {
                        val t0 = toTimestamp(WhisperLib.getTextSegmentT0(ptr, i))
                        val t1 = toTimestamp(WhisperLib.getTextSegmentT1(ptr, i))
                        append("[$t0 --> $t1]  $segment\n")
                    } else {
                        if (segment.isNotEmpty()) {
                            if (isNotEmpty()) append(' ')
                            append(segment)
                        }
                    }
                }
            }.trim()
        }

    suspend fun release() = withContext(scope.coroutineContext) {
        if (ptr != 0L) {
            WhisperLib.freeContext(ptr)
            ptr = 0
        }
    }

    protected fun finalize() {
        runBlocking { release() }
    }

    companion object {
        fun createContextFromFile(filePath: String): WhisperContext {
            val ptr = WhisperLib.initContext(filePath)
            if (ptr == 0L) throw RuntimeException("Couldn't create context with path $filePath")
            return WhisperContext(ptr)
        }

        fun createContextFromAsset(assetManager: AssetManager, assetPath: String): WhisperContext {
            val ptr = WhisperLib.initContextFromAsset(assetManager, assetPath)
            if (ptr == 0L) throw RuntimeException("Couldn't create context from asset $assetPath")
            return WhisperContext(ptr)
        }

        fun getSystemInfo(): String = WhisperLib.getSystemInfo()
    }
}

private class WhisperLib {
    companion object {
        init {
            Log.d(LOG_TAG, "Primary ABI: ${Build.SUPPORTED_ABIS[0]}")
            var loadVfpv4 = false
            var loadV8fp16 = false
            if (isArmEabiV7a()) {
                cpuInfo()?.let {
                    Log.d(LOG_TAG, "CPU info: $it")
                    if (it.contains("vfpv4")) {
                        Log.d(LOG_TAG, "CPU supports vfpv4")
                        loadVfpv4 = true
                    }
                }
            } else if (isArmEabiV8a()) {
                cpuInfo()?.let {
                    Log.d(LOG_TAG, "CPU info: $it")
                    if (it.contains("fphp")) {
                        Log.d(LOG_TAG, "CPU supports fp16 arithmetic")
                        loadV8fp16 = true
                    }
                }
            }

            when {
                loadVfpv4 -> {
                    Log.d(LOG_TAG, "Loading libwhisper_vfpv4.so")
                    System.loadLibrary("whisper_vfpv4")
                }
                loadV8fp16 -> {
                    Log.d(LOG_TAG, "Loading libwhisper_v8fp16_va.so")
                    System.loadLibrary("whisper_v8fp16_va")
                }
                else -> {
                    Log.d(LOG_TAG, "Loading libwhisper.so")
                    System.loadLibrary("whisper")
                }
            }
        }

        // JNI methods
        external fun initContextFromAsset(assetManager: AssetManager, assetPath: String): Long
        external fun initContext(modelPath: String): Long
        external fun freeContext(contextPtr: Long)
        external fun fullTranscribe(contextPtr: Long, numThreads: Int, audioData: FloatArray)
        external fun getTextSegmentCount(contextPtr: Long): Int
        external fun getTextSegment(contextPtr: Long, index: Int): String
        external fun getTextSegmentT0(contextPtr: Long, index: Int): Long
        external fun getTextSegmentT1(contextPtr: Long, index: Int): Long
        external fun getSystemInfo(): String
        external fun benchMemcpy(nthread: Int): String
        external fun benchGgmlMulMat(nthread: Int): String
    }
}

//  500 -> 00:00:05.000
private fun toTimestamp(t: Long): String {
    var msec = t * 10
    val hr = msec / (1000 * 60 * 60)
    msec -= hr * (1000 * 60 * 60)
    val min = msec / (1000 * 60)
    msec -= min * (1000 * 60)
    val sec = msec / 1000
    msec -= sec * 1000
    return String.format("%02d:%02d:%02d.%03d", hr, min, sec, msec)
}

private fun isArmEabiV7a(): Boolean = Build.SUPPORTED_ABIS[0] == "armeabi-v7a"
private fun isArmEabiV8a(): Boolean = Build.SUPPORTED_ABIS[0] == "arm64-v8a"

private fun cpuInfo(): String? = try {
    File("/proc/cpuinfo").inputStream().bufferedReader().use { it.readText() }
} catch (e: Exception) {
    Log.w(LOG_TAG, "Couldn't read /proc/cpuinfo", e)
    null
}
