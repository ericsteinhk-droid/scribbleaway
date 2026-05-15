package com.scribbleaway.meetingrecorder.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "meetings")
data class Meeting(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val dateMs: Long,
    val durationSeconds: Double = 0.0,
    val diarizedTranscript: String = "",
    val summaryJson: String = "",
    val status: MeetingStatus = MeetingStatus.RECORDING
)

enum class MeetingStatus { RECORDING, PAUSED, PROCESSING, DONE, ERROR }
