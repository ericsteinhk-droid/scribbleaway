package com.scribbleaway.meetingrecorder.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.scribbleaway.meetingrecorder.viewmodel.MeetingUiState
import com.scribbleaway.meetingrecorder.viewmodel.RecordingState

@Composable
fun RecordingScreen(
    uiState: MeetingUiState,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit
) {
    val scrollState = rememberScrollState()
    val wordCount = uiState.transcript.trim().split("\\s+".toRegex()).filter { it.isNotBlank() }.size

    // Auto-scroll to bottom as transcription grows
    LaunchedEffect(uiState.transcript, uiState.partialText) {
        scrollState.animateScrollTo(scrollState.maxValue)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // Header: timer + status
        RecordingHeader(uiState = uiState)

        // Live transcription area
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(vertical = 12.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxSize(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Transcription en direct",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (uiState.isListening) {
                                LiveIndicator()
                                Spacer(Modifier.width(6.dp))
                            }
                            Text(
                                text = "$wordCount mots",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                    ) {
                        if (uiState.transcript.isEmpty() && uiState.partialText.isEmpty()) {
                            Text(
                                text = "En attente de la parole…\nParlez clairement en français canadien.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
                                lineHeight = 24.sp
                            )
                        } else {
                            Text(
                                text = buildAnnotatedString {
                                    append(uiState.transcript)
                                    if (uiState.transcript.isNotEmpty() && uiState.partialText.isNotEmpty()) {
                                        append(" ")
                                    }
                                    // Show partial result in a lighter colour
                                    withStyle(
                                        SpanStyle(
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                                        )
                                    ) {
                                        append(uiState.partialText)
                                    }
                                },
                                style = MaterialTheme.typography.bodyLarge,
                                lineHeight = 28.sp
                            )
                        }
                    }
                }
            }
        }

        // Control bar
        RecordingControls(
            uiState = uiState,
            onPause = onPause,
            onResume = onResume,
            onStop = onStop
        )
    }
}

@Composable
private fun RecordingHeader(uiState: MeetingUiState) {
    val isRecording = uiState.recordingState == RecordingState.RECORDING

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                if (isRecording) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                else MaterialTheme.colorScheme.surfaceVariant
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = if (isRecording) "● ENREGISTREMENT" else "⏸ EN PAUSE",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = if (isRecording) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
            Text(
                text = "${uiState.participantCount} participants · fr-CA",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
        }

        Text(
            text = formatDuration(uiState.durationSeconds),
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            color = if (isRecording) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun RecordingControls(
    uiState: MeetingUiState,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit
) {
    var showStopDialog by remember { mutableStateOf(false) }
    val isRecording = uiState.recordingState == RecordingState.RECORDING

    if (showStopDialog) {
        AlertDialog(
            onDismissRequest = { showStopDialog = false },
            title = { Text("Terminer la réunion ?") },
            text = {
                Text("L'enregistrement et la transcription seront arrêtés. Vous pourrez sauvegarder les fichiers et générer un compte rendu.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showStopDialog = false
                        onStop()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) { Text("Terminer") }
            },
            dismissButton = {
                TextButton(onClick = { showStopDialog = false }) { Text("Annuler") }
            }
        )
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Pause / Resume
        FilledTonalButton(
            onClick = { if (isRecording) onPause() else onResume() },
            modifier = Modifier.weight(1f).height(52.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(
                imageVector = if (isRecording) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = null
            )
            Spacer(Modifier.width(8.dp))
            Text(if (isRecording) "Pause" else "Reprendre", fontWeight = FontWeight.SemiBold)
        }

        Spacer(Modifier.width(16.dp))

        // Stop
        Button(
            onClick = { showStopDialog = true },
            modifier = Modifier.weight(1f).height(52.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
            Icon(Icons.Default.Stop, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Terminer", fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun LiveIndicator() {
    val infiniteTransition = rememberInfiniteTransition(label = "live")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )
    Box(
        modifier = Modifier
            .size(8.dp)
            .scale(scale)
            .clip(CircleShape)
            .background(Color(0xFF4CAF50))
    )
}

private fun formatDuration(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
