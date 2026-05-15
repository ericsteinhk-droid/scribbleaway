package com.scribbleaway.meetingrecorder.model

data class PointDiscute(
    val timestamp: String,
    val sujet: String,
    val details: String
)

data class ActionItem(
    val action: String,
    val responsable: String,
    val echeance: String
)

data class MeetingSummary(
    val resumeExecutif: String,
    val pointsDiscutes: List<PointDiscute>,
    val decisions: List<String>,
    val actions: List<ActionItem>,
    val pointsEnSuspens: List<String>
)
