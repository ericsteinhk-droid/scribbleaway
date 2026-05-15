package com.scribbleaway.meetingrecorder.db

import androidx.room.*
import com.scribbleaway.meetingrecorder.model.Chunk

@Dao
interface ChunkDao {
    @Insert
    suspend fun insert(chunk: Chunk): Long

    @Update
    suspend fun update(chunk: Chunk)

    @Query("SELECT * FROM chunks WHERE meetingId = :meetingId ORDER BY `index`")
    suspend fun getChunksForMeeting(meetingId: Long): List<Chunk>

    @Query("DELETE FROM chunks WHERE meetingId = :meetingId")
    suspend fun deleteForMeeting(meetingId: Long)
}
