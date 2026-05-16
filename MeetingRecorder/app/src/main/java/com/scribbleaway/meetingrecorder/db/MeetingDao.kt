package com.scribbleaway.meetingrecorder.db

import androidx.room.*
import com.scribbleaway.meetingrecorder.model.Meeting
import com.scribbleaway.meetingrecorder.model.MeetingStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface MeetingDao {
    @Insert
    suspend fun insert(meeting: Meeting): Long

    @Update
    suspend fun update(meeting: Meeting)

    @Query("SELECT * FROM meetings ORDER BY dateMs DESC")
    fun allMeetings(): Flow<List<Meeting>>

    @Query("SELECT * FROM meetings WHERE id = :id")
    suspend fun getById(id: Long): Meeting?

    @Query("UPDATE meetings SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: Long, status: MeetingStatus)

    @Query("UPDATE meetings SET diarizedTranscript = :transcript, summaryJson = :summaryJson, status = :status, durationSeconds = :duration WHERE id = :id")
    suspend fun updateResults(id: Long, transcript: String, summaryJson: String, status: MeetingStatus, duration: Double)

    @Delete
    suspend fun delete(meeting: Meeting)

    @Query("DELETE FROM meetings WHERE id = :id")
    suspend fun deleteById(id: Long)
}
