package com.scribbleaway.meetingrecorder.di

import android.content.Context
import com.google.gson.Gson
import com.scribbleaway.meetingrecorder.db.AppDatabase
import com.scribbleaway.meetingrecorder.diarization.DiarizationService
import com.scribbleaway.meetingrecorder.network.OpenAiClient
import com.scribbleaway.meetingrecorder.prefs.AppPreferences
import com.scribbleaway.meetingrecorder.repository.MeetingRepository
import com.scribbleaway.meetingrecorder.repository.TranscriptionRepository
import com.scribbleaway.meetingrecorder.summary.SummaryService

object AppModule {

    fun provideMeetingRepository(context: Context): MeetingRepository {
        val prefs = AppPreferences(context)
        val db = AppDatabase.getInstance(context)
        val client = OpenAiClient { prefs.openAiApiKey }
        val gson = Gson()
        val transcriptionRepo = TranscriptionRepository(client, db.chunkDao())
        val diarizationService = DiarizationService(client)
        val summaryService = SummaryService(client)
        return MeetingRepository(
            db.meetingDao(),
            db.chunkDao(),
            transcriptionRepo,
            diarizationService,
            summaryService,
            gson
        )
    }
}
