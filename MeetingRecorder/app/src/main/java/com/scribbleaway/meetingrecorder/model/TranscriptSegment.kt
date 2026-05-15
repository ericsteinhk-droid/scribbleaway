package com.scribbleaway.meetingrecorder.model

data class TranscriptSegment(
    val speaker: String,
    val startSeconds: Double,
    val endSeconds: Double,
    val text: String
)
