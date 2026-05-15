package com.scribbleaway.meetingrecorder.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "chunks",
    foreignKeys = [ForeignKey(
        entity = Meeting::class,
        parentColumns = ["id"],
        childColumns = ["meetingId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [Index("meetingId")]
)
data class Chunk(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val meetingId: Long,
    val index: Int,
    val filePath: String,
    val offsetSeconds: Double,
    val durationSeconds: Double,
    val rawTranscript: String = "",
    val processed: Boolean = false
)
