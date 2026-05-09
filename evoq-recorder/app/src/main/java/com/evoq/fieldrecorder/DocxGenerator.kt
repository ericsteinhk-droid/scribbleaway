package com.evoq.fieldrecorder

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object DocxGenerator {

    fun generate(reportText: String): ByteArray {
        val baos = ByteArrayOutputStream()
        ZipOutputStream(baos).use { zip ->
            zip.putEntry("[Content_Types].xml", contentTypes())
            zip.putEntry("_rels/.rels", relationships())
            zip.putEntry("word/_rels/document.xml.rels", wordRels())
            zip.putEntry("word/document.xml", documentXml(reportText))
        }
        return baos.toByteArray()
    }

    private fun ZipOutputStream.putEntry(name: String, content: String) {
        putNextEntry(ZipEntry(name))
        write(content.toByteArray(Charsets.UTF_8))
        closeEntry()
    }

    private fun contentTypes() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    private fun relationships() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>"""

    private fun wordRels() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"""

    private fun documentXml(reportText: String): String {
        val body = buildBody(reportText)
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
$body
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/>
    </w:sectPr>
  </w:body>
</w:document>"""
    }

    private fun buildBody(reportText: String): String {
        val sb = StringBuilder()
        val lines = reportText.lines()
        var inHeader = true

        for ((i, raw) in lines.withIndex()) {
            val line = raw.trim()

            // First blank line ends the header block
            if (inHeader && line.isEmpty()) {
                inHeader = false
                sb.append(spacerPara())
                continue
            }

            when {
                line.isEmpty() -> sb.append(spacerPara())
                inHeader && i == 0 -> sb.append(titlePara(line))       // "EVOQ Architecture"
                inHeader -> sb.append(subtitlePara(line))               // "Field Report", "Date: ..."
                isBullet(line) -> sb.append(bulletPara(bulletText(line)))
                else -> sb.append(headingPara(line))
            }
        }
        return sb.toString()
    }

    private fun isBullet(line: String) =
        line.startsWith("•") || line.startsWith("-") || line.startsWith("·") || line.startsWith("*")

    private fun bulletText(line: String) =
        line.trimStart('•', '-', '·', '*').trim()

    private fun esc(t: String) = t
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")

    // ── paragraph builders ────────────────────────────────────────────────

    private fun titlePara(text: String) = """    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr>
        <w:t>${esc(text)}</w:t></w:r>
    </w:p>
"""

    private fun subtitlePara(text: String) = """    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
        <w:t>${esc(text)}</w:t></w:r>
    </w:p>
"""

    private fun headingPara(text: String) = """    <w:p>
      <w:pPr><w:spacing w:before="280" w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
        <w:t>${esc(text)}</w:t></w:r>
    </w:p>
"""

    private fun bulletPara(text: String) = """    <w:p>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
        <w:spacing w:after="60"/>
      </w:pPr>
      <w:r><w:t xml:space="preserve">•   ${esc(text)}</w:t></w:r>
    </w:p>
"""

    private fun spacerPara() = """    <w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>
"""
}
