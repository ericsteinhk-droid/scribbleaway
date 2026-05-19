package com.scribbleaway.meetingrecorder.prefs

import android.content.Context
import androidx.core.content.edit

class AppPreferences(context: Context) {

    private val prefs = context.getSharedPreferences("meeting_recorder_prefs", Context.MODE_PRIVATE)

    var assemblyAiApiKey: String
        get() = prefs.getString(KEY_ASSEMBLY_KEY, "") ?: ""
        set(value) = prefs.edit { putString(KEY_ASSEMBLY_KEY, value) }

    var anthropicApiKey: String
        get() = prefs.getString(KEY_ANTHROPIC_KEY, "") ?: ""
        set(value) = prefs.edit { putString(KEY_ANTHROPIC_KEY, value) }

    var chunkDurationMinutes: Int
        get() = prefs.getInt(KEY_CHUNK_DURATION, 15)
        set(value) = prefs.edit { putInt(KEY_CHUNK_DURATION, value) }

    var defaultSpeakerCount: Int
        get() = prefs.getInt(KEY_SPEAKER_COUNT, 4)
        set(value) = prefs.edit { putInt(KEY_SPEAKER_COUNT, value) }

    var meetingTitleTemplate: String
        get() = prefs.getString(KEY_TITLE_TEMPLATE, "Réunion de chantier") ?: "Réunion de chantier"
        set(value) = prefs.edit { putString(KEY_TITLE_TEMPLATE, value) }

    companion object {
        private const val KEY_ASSEMBLY_KEY = "assemblyai_api_key"
        private const val KEY_ANTHROPIC_KEY = "anthropic_api_key"
        private const val KEY_CHUNK_DURATION = "chunk_duration_minutes"
        private const val KEY_SPEAKER_COUNT = "speaker_count"
        private const val KEY_TITLE_TEMPLATE = "meeting_title_template"
    }
}
