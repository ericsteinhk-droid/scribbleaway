package com.scribbleaway.meetingrecorder.di

import android.content.Context
import com.google.gson.Gson
import com.scribbleaway.meetingrecorder.db.AppDatabase
import com.scribbleaway.meetingrecorder.network.AnthropicClient
import com.scribbleaway.meetingrecorder.network.AssemblyAiClient
import com.scribbleaway.meetingrecorder.prefs.AppPreferences
import com.scribbleaway.meetingrecorder.repository.MeetingRepository
import com.scribbleaway.meetingrecorder.repository.TranscriptionRepository
import com.scribbleaway.meetingrecorder.summary.SummaryService

object AppModule {

    fun provideMeetingRepository(context: Context): MeetingRepository {
        val prefs = AppPreferences(context)
        val db = AppDatabase.getInstance(context)
        val assemblyClient = AssemblyAiClient { prefs.assemblyAiApiKey }
        val anthropicClient = AnthropicClient { prefs.anthropicApiKey }
        val gson = Gson()
        val transcriptionRepo = TranscriptionRepository(assemblyClient, db.chunkDao())
        val summaryService = SummaryService(anthropicClient)
        return MeetingRepository(
            db.meetingDao(),
            db.chunkDao(),
            transcriptionRepo,
            summaryService,
            gson
        )
    }
}
