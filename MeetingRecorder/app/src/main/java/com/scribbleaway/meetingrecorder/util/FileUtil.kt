package com.scribbleaway.meetingrecorder.util

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

fun meetingDir(context: Context, meetingId: Long): File {
    return File(context.filesDir, "meetings/$meetingId").also { it.mkdirs() }
}

fun chunkFile(context: Context, meetingId: Long, index: Int): File {
    return File(meetingDir(context, meetingId), "chunk_$index.m4a")
}

fun exportDir(context: Context): File {
    return File(context.filesDir, "exports").also { it.mkdirs() }
}

fun docxFileName(title: String, dateMs: Long): String {
    val date = SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.CANADA_FRENCH).format(Date(dateMs))
    val safe = title.replace(Regex("[^\\w\\s-]"), "").trim().replace(' ', '_')
    return "${safe}_$date.docx"
}
