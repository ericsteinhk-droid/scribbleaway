package com.scribbleaway.meetingrecorder.util

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.scribbleaway.meetingrecorder.MainActivity
import com.scribbleaway.meetingrecorder.R

const val RECORDING_CHANNEL_ID = "recording_channel"
const val RECORDING_NOTIFICATION_ID = 1001

fun createNotificationChannel(context: Context) {
    val channel = NotificationChannel(
        RECORDING_CHANNEL_ID,
        context.getString(R.string.notification_channel_name),
        NotificationManager.IMPORTANCE_LOW
    ).apply { description = context.getString(R.string.notification_channel_desc) }
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(channel)
}

fun buildRecordingNotification(context: Context, elapsed: String, isPaused: Boolean): Notification {
    val pi = PendingIntent.getActivity(
        context, 0,
        Intent(context, MainActivity::class.java),
        PendingIntent.FLAG_IMMUTABLE
    )
    val statusText = if (isPaused)
        context.getString(R.string.status_paused)
    else
        context.getString(R.string.status_recording)

    return NotificationCompat.Builder(context, RECORDING_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(context.getString(R.string.app_name))
        .setContentText("$statusText — $elapsed")
        .setContentIntent(pi)
        .setOngoing(true)
        .setSilent(true)
        .build()
}
