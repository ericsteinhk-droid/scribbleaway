package com.scribbleaway.meetingrecorder.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "meetings")
data class MeetingEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val dateMillis: Long,
    val durationSeconds: Long,
    val participantCount: Int,
    val transcription: String,
    val meetingMinutes: String = "",
    val audioFilePath: String = "",
    val contextFilePath: String = "",
    val languageCode: String = "fr-CA"
)

@Dao
interface MeetingDao {
    @Insert
    suspend fun insert(meeting: MeetingEntity): Long

    @Update
    suspend fun update(meeting: MeetingEntity)

    @Delete
    suspend fun delete(meeting: MeetingEntity)

    @Query("SELECT * FROM meetings ORDER BY dateMillis DESC")
    fun getAllMeetings(): Flow<List<MeetingEntity>>

    @Query("SELECT * FROM meetings WHERE id = :id")
    suspend fun getMeetingById(id: Long): MeetingEntity?
}

@Database(entities = [MeetingEntity::class], version = 1, exportSchema = false)
abstract class MeetingDatabase : RoomDatabase() {
    abstract fun meetingDao(): MeetingDao

    companion object {
        @Volatile
        private var INSTANCE: MeetingDatabase? = null

        fun getInstance(context: Context): MeetingDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    MeetingDatabase::class.java,
                    "meeting_recorder.db"
                ).build().also { INSTANCE = it }
            }
        }
    }
}
