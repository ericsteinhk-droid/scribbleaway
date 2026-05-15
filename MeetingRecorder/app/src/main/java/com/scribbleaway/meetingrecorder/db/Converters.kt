package com.scribbleaway.meetingrecorder.db

import androidx.room.TypeConverter
import com.scribbleaway.meetingrecorder.model.MeetingStatus

class Converters {
    @TypeConverter
    fun fromStatus(status: MeetingStatus): String = status.name

    @TypeConverter
    fun toStatus(value: String): MeetingStatus = MeetingStatus.valueOf(value)
}
