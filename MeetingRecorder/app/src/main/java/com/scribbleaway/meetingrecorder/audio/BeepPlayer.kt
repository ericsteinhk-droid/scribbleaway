package com.scribbleaway.meetingrecorder.audio

import android.media.ToneGenerator
import android.media.AudioManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class BeepPlayer {

    // Short faint beep — volume 25 out of 100
    private val toneGen = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 25)

    suspend fun beepStart() = playTone(ToneGenerator.TONE_PROP_BEEP, 120)
    suspend fun beepPause() = playTone(ToneGenerator.TONE_PROP_ACK, 80)
    suspend fun beepStop() = playTone(ToneGenerator.TONE_PROP_NACK, 200)

    private suspend fun playTone(type: Int, durationMs: Int) = withContext(Dispatchers.IO) {
        runCatching { toneGen.startTone(type, durationMs) }
    }

    fun release() = runCatching { toneGen.release() }
}
