import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:path_provider/path_provider.dart';

/// Generates a .docx file from plain-text meeting minutes (Markdown-like headers).
class DocxService {
  Future<File> generateDocx({
    required String minutes,
    required String meetingTitle,
    required DateTime date,
  }) async {
    final archive = Archive();

    archive.addFile(ArchiveFile('[Content_Types].xml', -1,
        _utf8Bytes(_contentTypes())));
    archive.addFile(ArchiveFile('_rels/.rels', -1,
        _utf8Bytes(_rootRels())));
    archive.addFile(ArchiveFile('word/_rels/document.xml.rels', -1,
        _utf8Bytes(_documentRels())));
    archive.addFile(ArchiveFile('word/styles.xml', -1,
        _utf8Bytes(_styles())));
    archive.addFile(ArchiveFile('word/settings.xml', -1,
        _utf8Bytes(_settings())));
    archive.addFile(ArchiveFile('word/document.xml', -1,
        _utf8Bytes(_document(minutes))));
    archive.addFile(ArchiveFile('docProps/core.xml', -1,
        _utf8Bytes(_coreProps(meetingTitle, date))));
    archive.addFile(ArchiveFile('docProps/app.xml', -1,
        _utf8Bytes(_appProps())));

    final bytes = ZipEncoder().encode(archive)!;
    final dir = await getApplicationDocumentsDirectory();
    final safeName = meetingTitle.replaceAll(RegExp(r'[^\w\s-]'), '').trim();
    final dateStr =
        '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final file = File('${dir.path}/${safeName}_$dateStr.docx');
    await file.writeAsBytes(bytes);
    return file;
  }

  Uint8List _utf8Bytes(String s) {
    final encoded = s.codeUnits;
    return Uint8List.fromList(encoded.map((c) => c & 0xFF).toList());
  }

  String _document(String minutes) {
    final paragraphs = _parseMinutesToXml(minutes);
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
$paragraphs
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>''';
  }

  String _parseMinutesToXml(String minutes) {
    final buf = StringBuffer();
    final lines = minutes.split('\n');

    for (var line in lines) {
      final trimmed = line.trim();

      if (trimmed.startsWith('# ')) {
        buf.writeln(_heading1(trimmed.substring(2)));
      } else if (trimmed.startsWith('## ')) {
        buf.writeln(_heading2(trimmed.substring(3)));
      } else if (trimmed.startsWith('### ')) {
        buf.writeln(_heading3(trimmed.substring(4)));
      } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // Table row – render as normal paragraph with tab separators
        final cells = trimmed
            .split('|')
            .where((c) => c.trim().isNotEmpty)
            .map((c) => c.trim())
            .toList();
        if (cells.every((c) => c.startsWith('-') || c.startsWith(':'))) {
          continue; // skip separator row
        }
        buf.writeln(_tableRow(cells));
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        buf.writeln(_bulletParagraph(trimmed.substring(2)));
      } else if (RegExp(r'^\d+\. ').hasMatch(trimmed)) {
        buf.writeln(_numberedParagraph(trimmed.replaceFirst(RegExp(r'^\d+\. '), '')));
      } else if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
        buf.writeln(_boldParagraph(trimmed.substring(2, trimmed.length - 2)));
      } else if (trimmed.startsWith('---') || trimmed.startsWith('___')) {
        buf.writeln(_hrParagraph());
      } else if (trimmed.isEmpty) {
        buf.writeln(_emptyParagraph());
      } else {
        // Handle inline bold (**text**)
        buf.writeln(_inlineParagraph(trimmed));
      }
    }

    return buf.toString();
  }

  String _esc(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  String _heading1(String text) => '''
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr>
      <w:r><w:t>${_esc(text)}</w:t></w:r>
    </w:p>''';

  String _heading2(String text) => '''
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="200" w:after="80"/></w:pPr>
      <w:r><w:t>${_esc(text)}</w:t></w:r>
    </w:p>''';

  String _heading3(String text) => '''
    <w:p>
      <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
      <w:r><w:t>${_esc(text)}</w:t></w:r>
    </w:p>''';

  String _boldParagraph(String text) => '''
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>${_esc(text)}</w:t></w:r>
    </w:p>''';

  String _bulletParagraph(String text) => '''
    <w:p>
      <w:pPr>
        <w:pStyle w:val="ListBullet"/>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
      </w:pPr>
      ${_renderInline(text)}
    </w:p>''';

  String _numberedParagraph(String text) => '''
    <w:p>
      <w:pPr>
        <w:pStyle w:val="ListNumber"/>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>
      </w:pPr>
      ${_renderInline(text)}
    </w:p>''';

  String _tableRow(List<String> cells) {
    final cellXml = cells
        .map((c) => '      <w:r><w:t xml:space="preserve">${_esc(c)}</w:t></w:r>'
            '<w:r><w:rPr><w:b/></w:rPr></w:r>')
        .join('<w:r><w:tab/></w:r>\n');
    return '''
    <w:p>
      <w:pPr><w:tabs><w:tab w:val="left" w:pos="3600"/><w:tab w:val="left" w:pos="7200"/></w:tabs></w:pPr>
$cellXml
    </w:p>''';
  }

  String _hrParagraph() => '''
    <w:p>
      <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr>
    </w:p>''';

  String _emptyParagraph() => '    <w:p/>';

  String _inlineParagraph(String text) => '''
    <w:p>
      ${_renderInline(text)}
    </w:p>''';

  String _renderInline(String text) {
    // Split on **bold** markers
    final parts = text.split('**');
    final buf = StringBuffer();
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].isEmpty) continue;
      if (i % 2 == 1) {
        buf.write('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${_esc(parts[i])}</w:t></w:r>');
      } else {
        buf.write('<w:r><w:t xml:space="preserve">${_esc(parts[i])}</w:t></w:r>');
      }
    }
    return buf.toString();
  }

  String _contentTypes() => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml"
    ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml"
    ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>''';

  String _rootRels() => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
    Target="docProps/core.xml"/>
  <Relationship Id="rId3"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"
    Target="docProps/app.xml"/>
</Relationships>''';

  String _documentRels() => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"
    Target="settings.xml"/>
</Relationships>''';

  String _settings() => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
  <w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>''';

  String _styles() => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/><w:szCs w:val="22"/>
        <w:lang w:val="fr-CA" w:eastAsia="fr-CA" w:bidi="ar-SA"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/><w:szCs w:val="40"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:color w:val="2E74B5"/><w:sz w:val="28"/><w:szCs w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/><w:color w:val="2E74B5"/><w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber">
    <w:name w:val="List Number"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>
    </w:pPr>
  </w:style>
</w:styles>''';

  String _coreProps(String title, DateTime date) {
    final iso = date.toIso8601String();
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${_esc(title)}</dc:title>
  <dc:creator>ScribbleAway</dc:creator>
  <cp:lastModifiedBy>ScribbleAway</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$iso</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$iso</dcterms:modified>
</cp:coreProperties>''';
  }

  String _appProps() => '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>ScribbleAway</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <SharedDoc>false</SharedDoc>
</Properties>''';
}
