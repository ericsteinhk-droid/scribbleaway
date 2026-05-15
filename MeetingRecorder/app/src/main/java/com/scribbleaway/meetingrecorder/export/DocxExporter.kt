package com.scribbleaway.meetingrecorder.export

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.scribbleaway.meetingrecorder.model.Meeting
import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.util.docxFileName
import com.scribbleaway.meetingrecorder.util.exportDir
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class DocxExporter(private val context: Context) {

    suspend fun export(
        meeting: Meeting,
        summary: MeetingSummary,
        transcript: List<TranscriptSegment>
    ): Uri = withContext(Dispatchers.IO) {
        val documentXml = WordXmlWriter.buildDocumentXml(
            title = meeting.title,
            dateMs = meeting.dateMs,
            summary = summary,
            transcript = transcript
        )
        val fileName = docxFileName(meeting.title, meeting.dateMs)
        val outputFile = File(exportDir(context), fileName)
        DocxBuilder.write(documentXml, outputFile)

        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outputFile)
    }
}
