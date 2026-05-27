package com.scribbleaway.meetingrecorder.ui.preview

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.scribbleaway.meetingrecorder.App
import com.scribbleaway.meetingrecorder.export.DocxExporter
import com.scribbleaway.meetingrecorder.model.Meeting
import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.prefs.AppPreferences
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class PreviewViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = (app as App).meetingRepository
    private val prefs = AppPreferences(app)
    private val gson = Gson()
    private val exporter = DocxExporter(app)

    private var currentMeetingId = -1L

    private val _meeting = MutableStateFlow<Meeting?>(null)
    val meeting: StateFlow<Meeting?> = _meeting.asStateFlow()

    private val _summary = MutableStateFlow<MeetingSummary?>(null)
    val summary: StateFlow<MeetingSummary?> = _summary.asStateFlow()

    private val _transcript = MutableStateFlow<List<TranscriptSegment>>(emptyList())
    val transcript: StateFlow<List<TranscriptSegment>> = _transcript.asStateFlow()

    private val _processing = MutableStateFlow(false)
    val processing: StateFlow<Boolean> = _processing.asStateFlow()

    private val _processingStatus = MutableStateFlow("")
    val processingStatus: StateFlow<String> = _processingStatus.asStateFlow()

    private val _exportUri = MutableStateFlow<Uri?>(null)
    val exportUri: StateFlow<Uri?> = _exportUri.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadAndProcess(meetingId: Long) {
        currentMeetingId = meetingId
        viewModelScope.launch {
            _processing.value = true
            _processingStatus.value = "Préparation…"

            // Brief pause so the final-chunk DB write from RecordViewModel
            // (which runs concurrently) has time to complete before we read chunks.
            kotlinx.coroutines.delay(500)

            val meeting = repo.getMeeting(meetingId)
            if (meeting == null) {
                _error.value = "Réunion introuvable."
                _processing.value = false
                return@launch
            }
            _meeting.value = meeting

            runCatching {
                repo.processRecording(
                    meetingId = meetingId,
                    expectedSpeakers = prefs.defaultSpeakerCount
                ) { status -> _processingStatus.value = status }
            }.onFailure {
                _error.value = it.message
                _processing.value = false
                return@launch
            }

            loadResults(meetingId)
            _processing.value = false
        }
    }

    fun retryProcessing() {
        if (currentMeetingId < 0) return
        loadAndProcess(currentMeetingId)
    }

    fun retrySummary() {
        val meetingId = _meeting.value?.id ?: return
        viewModelScope.launch {
            _processing.value = true
            _processingStatus.value = "Génération du résumé…"
            runCatching { repo.retrySummary(meetingId) }
                .onSuccess { summary -> _summary.value = summary }
                .onFailure { _error.value = it.message }
            _processing.value = false
        }
    }

    fun exportDocx() {
        val m = _meeting.value ?: return
        val s = _summary.value ?: return
        val t = _transcript.value
        viewModelScope.launch {
            _processing.value = true
            _processingStatus.value = "Génération du fichier DOCX…"
            runCatching { exporter.export(m, s, t) }
                .onSuccess { uri -> _exportUri.value = uri }
                .onFailure { _error.value = "Erreur export: ${it.message}" }
            _processing.value = false
        }
    }

    private suspend fun loadResults(meetingId: Long) {
        val processed = repo.getMeeting(meetingId)
        _meeting.value = processed
        processed?.let { m ->
            if (m.summaryJson.isNotBlank()) {
                runCatching {
                    _summary.value = gson.fromJson(m.summaryJson, MeetingSummary::class.java)
                }
            }
            if (m.diarizedTranscript.isNotBlank()) {
                runCatching {
                    val type = object : TypeToken<List<TranscriptSegment>>() {}.type
                    _transcript.value = gson.fromJson(m.diarizedTranscript, type)
                }
            }
        }
    }

    fun clearExportUri() { _exportUri.value = null }
    fun clearError() { _error.value = null }
}
