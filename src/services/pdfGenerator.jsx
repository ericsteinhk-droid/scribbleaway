import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { ENTRY_TYPES, ENTRY_TYPE_ORDER } from '../utils/constants'
import { formatDate, formatReportNumber } from '../utils/format'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: '20mm 20mm 25mm 20mm', color: '#1a1a2e' },
  header: { marginBottom: 16, paddingBottom: 12, borderBottom: '2pt solid #00a99e' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  firmBlock: { flex: 1 },
  evoqLogo: { height: 22, width: 'auto', objectFit: 'contain', alignSelf: 'flex-start', marginBottom: 4 },
  reportTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1a1a2e', marginBottom: 4 },
  meta: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  metaBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#00a99e', marginBottom: 8, paddingBottom: 4, borderBottom: '1pt solid #e5e7eb' },
  attendeeRow: { flexDirection: 'row', marginBottom: 3 },
  attendeeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#00a99e', marginTop: 3, marginRight: 6 },
  attendeeText: { fontSize: 9, color: '#374151' },
  entryGroup: { marginBottom: 14 },
  groupTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6, padding: '4pt 8pt', borderRadius: 4 },
  entry: { marginBottom: 10, padding: '8pt', border: '1pt solid #e5e7eb', borderRadius: 4, backgroundColor: '#fafafa' },
  entryNum: { fontSize: 8, color: '#9ca3af', marginBottom: 3 },
  entryText: { fontSize: 9.5, lineHeight: 1.5, color: '#1f2937' },
  photo: { marginTop: 8, marginBottom: 4 },
  photoImg: { maxWidth: '100%', maxHeight: 180, objectFit: 'contain' },
  photoCaption: { fontSize: 8, color: '#6b7280', fontStyle: 'italic', marginTop: 2 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  photoItem: { width: '48%' },
  signature: { marginTop: 24, paddingTop: 16, borderTop: '1pt solid #e5e7eb', flexDirection: 'row', justifyContent: 'flex-end' },
  sigBlock: { width: 200, textAlign: 'center' },
  sigLine: { borderTop: '1pt solid #374151', marginTop: 40, marginBottom: 4 },
  sigName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151' },
  sigTitle: { fontSize: 8, color: '#6b7280' },
  footer: { position: 'absolute', bottom: '12mm', left: '20mm', right: '20mm', flexDirection: 'row', justifyContent: 'space-between', borderTop: '1pt solid #e5e7eb', paddingTop: 4 },
  footerText: { fontSize: 8, color: '#9ca3af' },
  pageNum: { fontSize: 8, color: '#9ca3af' },
  tagObservation: { backgroundColor: '#dbeafe', color: '#1e40af' },
  tagAvancement: { backgroundColor: '#dcfce7', color: '#166534' },
  tagDiscussion: { backgroundColor: '#fef9c3', color: '#854d0e' },
  tagDirective: { backgroundColor: '#fee2e2', color: '#991b1b' },
})

const tagStyles = {
  observation: styles.tagObservation,
  avancement: styles.tagAvancement,
  discussion: styles.tagDiscussion,
  directive: styles.tagDirective,
}

function groupEntriesByType(entries) {
  const groups = {}
  ENTRY_TYPE_ORDER.forEach((type) => {
    const typed = entries.filter((e) => e.type === type)
    if (typed.length > 0) groups[type] = typed
  })
  return groups
}

export function ReportPDF({ report, project }) {
  const groups = groupEntriesByType(report.entries || [])
  const reportDate = report.date ? formatDate(report.date) : ''

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.firmBlock}>
              <Image src="/evoq_logo.png" style={styles.evoqLogo} />
              <Text style={styles.reportTitle}>
                Rapport de chantier #{formatReportNumber(report.number)}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 24 }}>
            <View>
              <Text style={styles.metaBold}>{project.name}</Text>
              <Text style={styles.meta}>{project.address}</Text>
            </View>
            <View>
              <Text style={styles.meta}>Date : {reportDate}</Text>
              {report.time && <Text style={styles.meta}>Heure : {report.time}</Text>}
              {report.weather && <Text style={styles.meta}>Météo : {report.weather}</Text>}
            </View>
            <View>
              <Text style={styles.meta}>Architecte : {report.authorName}</Text>
            </View>
          </View>
        </View>

        {/* Attendees */}
        {report.attendees?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personnes présentes</Text>
            {report.attendees.map((a, i) => (
              <View key={i} style={styles.attendeeRow}>
                <View style={styles.attendeeDot} />
                <Text style={styles.attendeeText}>{a}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Entries by group */}
        {Object.entries(groups).map(([type, entries]) => (
          <View key={type} style={styles.entryGroup}>
            <Text style={[styles.groupTitle, tagStyles[type]]}>
              {ENTRY_TYPES[type]?.label}
            </Text>
            {entries.map((entry, idx) => (
              <View key={entry.id || idx} style={styles.entry}>
                <Text style={styles.entryNum}>#{idx + 1}</Text>
                <Text style={styles.entryText}>{entry.text}</Text>
                {entry.photos?.length > 0 && (
                  <View style={styles.photoGrid}>
                    {entry.photos.map((photo, pi) => (
                      <View key={pi} style={styles.photoItem}>
                        <Image src={photo.url} style={styles.photoImg} />
                        {photo.caption && (
                          <Text style={styles.photoCaption}>{photo.caption}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {/* Signature */}
        <View style={styles.signature}>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigName}>{report.authorName}</Text>
            <Text style={styles.sigTitle}>Architecte</Text>
            {report.firmName && <Text style={styles.sigTitle}>{report.firmName}</Text>}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{project.name} — Rapport #{formatReportNumber(report.number)}</Text>
          <Text style={styles.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
