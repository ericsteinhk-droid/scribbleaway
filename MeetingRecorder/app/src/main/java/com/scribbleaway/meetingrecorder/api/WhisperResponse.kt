package com.scribbleaway.meetingrecorder.api

import com.google.gson.annotations.SerializedName

data class WhisperResponse(
    val text: String,
    val segments: List<WhisperSegment>?,
    val language: String?
)

data class WhisperSegment(
    val id: Int,
    val start: Double,
    val end: Double,
    val text: String,
    @SerializedName("avg_logprob") val avgLogprob: Double?,
    @SerializedName("no_speech_prob") val noSpeechProb: Double?
)
