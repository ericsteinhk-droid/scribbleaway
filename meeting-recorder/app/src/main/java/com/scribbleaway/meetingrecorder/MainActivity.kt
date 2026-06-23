package com.scribbleaway.meetingrecorder

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.scribbleaway.meetingrecorder.ui.screens.*
import com.scribbleaway.meetingrecorder.ui.theme.MeetingRecorderTheme
import com.scribbleaway.meetingrecorder.viewmodel.MeetingViewModel
import com.scribbleaway.meetingrecorder.viewmodel.RecordingState

sealed class Screen(val route: String, val label: String) {
    object Home : Screen("home", "Accueil")
    object Recording : Screen("recording", "Enregistrement")
    object Completion : Screen("completion", "Résultats")
    object Minutes : Screen("minutes", "Compte rendu")
    object History : Screen("history", "Historique")
}

class MainActivity : ComponentActivity() {

    private val requiredPermissions = buildList {
        add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    private var onPermissionsGranted: (() -> Unit)? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val allGranted = results.all { it.value }
        if (allGranted) onPermissionsGranted?.invoke()
    }

    fun requestPermissionsAndThen(action: () -> Unit) {
        onPermissionsGranted = action
        permissionLauncher.launch(requiredPermissions)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MeetingRecorderTheme {
                MeetingRecorderApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeetingRecorderApp() {
    val navController = rememberNavController()
    val vm: MeetingViewModel = viewModel()
    val uiState by vm.uiState.collectAsStateWithLifecycle()
    val meetings by vm.allMeetings.collectAsStateWithLifecycle(initialValue = emptyList())
    val activity = androidx.compose.ui.platform.LocalContext.current as MainActivity
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

    // Navigate automatically based on recording state
    LaunchedEffect(uiState.recordingState) {
        when (uiState.recordingState) {
            RecordingState.RECORDING, RecordingState.PAUSED -> {
                if (currentRoute != Screen.Recording.route) {
                    navController.navigate(Screen.Recording.route) {
                        popUpTo(Screen.Home.route)
                    }
                }
            }
            RecordingState.STOPPED -> {
                navController.navigate(Screen.Completion.route) {
                    popUpTo(Screen.Home.route)
                }
            }
            else -> {}
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = when (currentRoute) {
                            Screen.Home.route -> "Transcripteur de Réunion"
                            Screen.Recording.route -> "Réunion en cours"
                            Screen.Completion.route -> "Fin de réunion"
                            Screen.Minutes.route -> "Compte rendu"
                            Screen.History.route -> "Historique"
                            else -> "Transcripteur"
                        },
                        fontWeight = FontWeight.SemiBold
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            if (currentRoute !in listOf(Screen.Recording.route, Screen.Minutes.route)) {
                NavigationBar {
                    NavigationBarItem(
                        selected = currentRoute == Screen.Home.route,
                        onClick = {
                            navController.navigate(Screen.Home.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.Default.Mic, contentDescription = null) },
                        label = { Text("Nouvelle") }
                    )
                    NavigationBarItem(
                        selected = currentRoute == Screen.History.route,
                        onClick = {
                            navController.navigate(Screen.History.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(Icons.Default.History, contentDescription = null) },
                        label = { Text("Historique") }
                    )
                }
            }
        },
        snackbarHost = {
            uiState.error?.let { error ->
                LaunchedEffect(error) {
                    // shown inline on screens, not via snackbar
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(padding)
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    uiState = uiState,
                    onParticipantCountChange = vm::setParticipantCount,
                    onLoadContextFile = vm::loadContextFile,
                    onClearContextFile = vm::clearContextFile,
                    onStartRecording = {
                        activity.requestPermissionsAndThen {
                            vm.startRecording()
                        }
                    }
                )
            }

            composable(Screen.Recording.route) {
                RecordingScreen(
                    uiState = uiState,
                    onPause = vm::pauseRecording,
                    onResume = vm::resumeRecording,
                    onStop = vm::stopRecording
                )
            }

            composable(Screen.Completion.route) {
                CompletionScreen(
                    uiState = uiState,
                    onSaveTranscription = vm::saveTranscription,
                    onSaveMeetingToDb = vm::saveMeetingToDatabase,
                    onGenerateMinutes = vm::generateMeetingMinutes,
                    onViewMinutes = {
                        navController.navigate(Screen.Minutes.route)
                    },
                    onNewMeeting = {
                        vm.resetSession()
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Home.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Minutes.route) {
                MinutesScreen(
                    minutesText = uiState.meetingMinutes,
                    onSaveMinutes = vm::saveMinutes,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.History.route) {
                HistoryScreen(
                    meetings = meetings,
                    onMeetingClick = { meeting ->
                        // Future: navigate to meeting detail screen
                    }
                )
            }
        }
    }
}
