package com.scribbleaway.meetingrecorder.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val RecordingRed = Color(0xFFD32F2F)
private val RecordingRedLight = Color(0xFFFF6659)
private val RecordingRedDark = Color(0xFF9A0007)
private val SurfaceDark = Color(0xFF1A1A2E)
private val SurfaceDarkVariant = Color(0xFF16213E)
private val OnSurfaceDark = Color(0xFFE8EAF6)

private val LightColors = lightColorScheme(
    primary = RecordingRed,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDAD6),
    onPrimaryContainer = Color(0xFF410002),
    secondary = Color(0xFF1565C0),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6E4FF),
    onSecondaryContainer = Color(0xFF001D4A),
    background = Color(0xFFFFFBFF),
    surface = Color(0xFFFFFBFF),
    surfaceVariant = Color(0xFFF3F3F3),
    onSurface = Color(0xFF201A1B),
    outline = Color(0xFF857370)
)

private val DarkColors = darkColorScheme(
    primary = RecordingRedLight,
    onPrimary = Color(0xFF690005),
    primaryContainer = RecordingRedDark,
    onPrimaryContainer = Color(0xFFFFDAD6),
    secondary = Color(0xFF90CAF9),
    onSecondary = Color(0xFF003258),
    secondaryContainer = Color(0xFF004880),
    onSecondaryContainer = Color(0xFFD6E4FF),
    background = SurfaceDark,
    surface = SurfaceDark,
    surfaceVariant = SurfaceDarkVariant,
    onSurface = OnSurfaceDark,
    outline = Color(0xFF9F8C8D)
)

@Composable
fun MeetingRecorderTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content
    )
}
