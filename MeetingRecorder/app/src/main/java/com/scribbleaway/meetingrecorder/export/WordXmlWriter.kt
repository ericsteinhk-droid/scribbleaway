package com.scribbleaway.meetingrecorder.export

import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.util.formatTimestamp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object WordXmlWriter {

    private val dateFormat = SimpleDateFormat("d MMMM yyyy, HH:mm", Locale.CANADA_FRENCH)

    fun buildDocumentXml(
        title: String,
        dateMs: Long,
        summary: MeetingSummary,
        transcript: List<TranscriptSegment>
    ): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append(
            """<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>"""
        )

        // Title
        appendHeading1(this, title)
        appendNormal(this, "Date: ${dateFormat.format(Date(dateMs))}")
        appendNormal(this, "")

        // Speakers
        val speakers = transcript.map { it.speaker }.distinct()
        if (speakers.isNotEmpty()) {
            appendHeading2(this, "INTERVENANTS")
            speakers.forEach { appendBullet(this, it) }
            appendNormal(this, "")
        }

        // Executive summary
        appendHeading2(this, "RÉSUMÉ EXÉCUTIF")
        summary.resumeExecutif.split("\n").forEach { para ->
            if (para.isNotBlank()) appendNormal(this, para.trim())
        }
        appendNormal(this, "")

        // Points discussed
        if (summary.pointsDiscutes.isNotEmpty()) {
            appendHeading2(this, "POINTS DISCUTÉS")
            summary.pointsDiscutes.forEach { point ->
                appendBoldLabel(this, "[${point.timestamp}] ${point.sujet}", point.details)
            }
            appendNormal(this, "")
        }

        // Decisions
        if (summary.decisions.isNotEmpty()) {
            appendHeading2(this, "DÉCISIONS PRISES")
            summary.decisions.forEach { appendBullet(this, it) }
            appendNormal(this, "")
        }

        // Action items
        if (summary.actions.isNotEmpty()) {
            appendHeading2(this, "ACTIONS À ENTREPRENDRE")
            summary.actions.forEach { action ->
                val line = buildString {
                    append(action.action)
                    if (action.responsable.isNotBlank()) append(" — Responsable: ${action.responsable}")
                    if (action.echeance.isNotBlank()) append(" — Échéance: ${action.echeance}")
                }
                appendBullet(this, line)
            }
            appendNormal(this, "")
        }

        // Open items
        if (summary.pointsEnSuspens.isNotEmpty()) {
            appendHeading2(this, "POINTS EN SUSPENS")
            summary.pointsEnSuspens.forEach { appendBullet(this, it) }
            appendNormal(this, "")
        }

        // Full transcript
        appendHeading2(this, "TRANSCRIPTION COMPLÈTE")
        var lastSpeaker = ""
        transcript.forEach { seg ->
            if (seg.speaker != lastSpeaker) {
                lastSpeaker = seg.speaker
            }
            appendSpeakerLine(this, seg.speaker, formatTimestamp(seg.startSeconds), seg.text)
        }

        append("""<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>""")
        append("</w:body></w:document>")
    }

    private fun appendHeading1(sb: StringBuilder, text: String) {
        sb.append("""<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F3864"/></w:rPr><w:t>${esc(text)}</w:t></w:r></w:p>""")
    }

    private fun appendHeading2(sb: StringBuilder, text: String) {
        sb.append("""<w:p><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2E75B6"/></w:rPr><w:t>${esc(text)}</w:t></w:r></w:p>""")
    }

    private fun appendNormal(sb: StringBuilder, text: String) {
        sb.append("""<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>""")
    }

    private fun appendBullet(sb: StringBuilder, text: String) {
        sb.append("""<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">• ${esc(text)}</w:t></w:r></w:p>""")
    }

    private fun appendBoldLabel(sb: StringBuilder, label: String, detail: String) {
        sb.append("""<w:p><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr>""")
        sb.append("""<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(label)}</w:t></w:r>""")
        if (detail.isNotBlank()) {
            sb.append("""<w:r><w:t xml:space="preserve"> — ${esc(detail)}</w:t></w:r>""")
        }
        sb.append("</w:p>")
    }

    private fun appendSpeakerLine(sb: StringBuilder, speaker: String, timestamp: String, text: String) {
        sb.append("""<w:p><w:pPr><w:spacing w:before="80" w:after="40"/></w:pPr>""")
        sb.append("""<w:r><w:rPr><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">[$timestamp] </w:t></w:r>""")
        sb.append("""<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(speaker)}: </w:t></w:r>""")
        sb.append("""<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>""")
        sb.append("</w:p>")
    }

    private fun esc(text: String): String = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
}
