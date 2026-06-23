package com.scribbleaway.meetingrecorder.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {

    companion object {
        private val KEY_CLAUDE_API_KEY = stringPreferencesKey("claude_api_key")
        private val KEY_DEFAULT_PARTICIPANTS = stringPreferencesKey("default_participants")

        @Volatile
        private var INSTANCE: SettingsRepository? = null

        fun getInstance(context: Context): SettingsRepository {
            return INSTANCE ?: synchronized(this) {
                SettingsRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    val claudeApiKey: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_CLAUDE_API_KEY] ?: ""
    }

    val defaultParticipants: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[KEY_DEFAULT_PARTICIPANTS]?.toIntOrNull() ?: 8
    }

    suspend fun setClaudeApiKey(key: String) {
        context.dataStore.edit { it[KEY_CLAUDE_API_KEY] = key.trim() }
    }

    suspend fun setDefaultParticipants(count: Int) {
        context.dataStore.edit { it[KEY_DEFAULT_PARTICIPANTS] = count.toString() }
    }
}
