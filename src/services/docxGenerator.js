import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  ImageRun,
  PageNumber,
  Footer,
  Header,
} from 'docx'
import { ENTRY_TYPES, ENTRY_TYPE_ORDER } from '../utils/constants'
import { formatDate, formatReportNumber } from '../utils/format'

const COLORS = {
  primary: '6172f3',
  observation: { bg: 'DBEAFE', text: '1E40AF' },
  avancement: { bg: 'DCFCE7', text: '166534' },
  discussion: { bg: 'FEF9C3', text: '854D0E' },
  directive: { bg: 'FEE2E2', text: '991B1B' },
}

function heading(text, level = 1) {
  return new Paragraph({
    text,
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: level === 1 ? 400 : 240, after: 120 },
  })
}

function para(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: options.size || 20, color: options.color || '1F2937', bold: options.bold })],
    spacing: { after: options.after || 80 },
    alignment: options.align || AlignmentType.LEFT,
  })
}

function sectionHeader(label, color) {
  return new Paragraph({
    children: [new TextRun({ text: label, bold: true, size: 22, color: color.text })],
    shading: { type: ShadingType.CLEAR, fill: color.bg },
    spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: color.text } },
  })
}

async function fetchImageAsBuffer(url) {
  try {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    return buf
  } catch {
    return null
  }
}

export async function generateDocx(report, project) {
  const reportDate = report.date ? formatDate(report.date) : ''
  const groups = {}
  ENTRY_TYPE_ORDER.forEach((type) => {
    const typed = (report.entries || []).filter((e) => e.type === type)
    if (typed.length > 0) groups[type] = typed
  })

  const children = []

  // Report title
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: report.firmName || project.firmName || "Cabinet d'architecture", bold: true, size: 28, color: COLORS.primary }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Rapport de chantier #${formatReportNumber(report.number)}`, bold: true, size: 36, color: '1A1A2E' }),
      ],
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.primary } },
    }),
  )

  // Meta info table
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [para(`Projet : ${project.name}`, { bold: true })], width: { size: 40, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [para(`Date : ${reportDate}`)] }),
            new TableCell({ children: [para(`Architecte : ${report.authorName}`)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [para(project.address || '')] }),
            new TableCell({ children: [para(report.time ? `Heure : ${report.time}` : '')] }),
            new TableCell({ children: [para(report.weather ? `Météo : ${report.weather}` : '')] }),
          ],
        }),
      ],
    }),
    new Paragraph({ text: '', spacing: { after: 200 } }),
  )

  // Attendees
  if (report.attendees?.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Personnes présentes', bold: true, size: 24, color: COLORS.primary })],
        spacing: { before: 200, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.primary } },
      }),
    )
    report.attendees.forEach((a) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${a}`, size: 20 })],
          spacing: { after: 60 },
        }),
      )
    })
    children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  }

  // Entry groups
  for (const [type, entries] of Object.entries(groups)) {
    const color = COLORS[type]
    children.push(sectionHeader(ENTRY_TYPES[type]?.label || type, color))

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx]
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `#${idx + 1}`, size: 16, color: '9CA3AF' })],
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: entry.text || '', size: 20, color: '1F2937' })],
          spacing: { after: 120 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: COLORS.primary },
          },
          indent: { left: 240 },
        }),
      )

      // Photos
      if (entry.photos?.length > 0) {
        for (const photo of entry.photos) {
          const buf = await fetchImageAsBuffer(photo.url)
          if (buf) {
            children.push(
              new Paragraph({
                children: [new ImageRun({ data: buf, type: 'jpg', transformation: { width: 400, height: 250 } })],
                spacing: { after: 60 },
              }),
            )
          }
          if (photo.caption) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: photo.caption, italics: true, size: 16, color: '6B7280' })],
                spacing: { after: 120 },
              }),
            )
          }
        }
      }
    }
  }

  // Signature
  children.push(
    new Paragraph({ text: '', spacing: { before: 400 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [para('')], width: { size: 60, type: WidthType.PERCENTAGE } }),
            new TableCell({
              children: [
                new Paragraph({ text: '', spacing: { before: 600 } }),
                new Paragraph({
                  children: [new TextRun({ text: '_________________________', color: '374151' })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 60 },
                }),
                new Paragraph({
                  children: [new TextRun({ text: report.authorName, bold: true, size: 20, color: '374151' })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 40 },
                }),
                new Paragraph({
                  children: [new TextRun({ text: 'Architecte', size: 18, color: '6B7280' })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  )

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB' }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: `${project.name} — Rapport #${formatReportNumber(report.number)}`, size: 16, color: '9CA3AF' })] })],
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [
                            new TextRun({ children: [PageNumber.CURRENT] }),
                            new TextRun({ text: ' / ', size: 16, color: '9CA3AF' }),
                            new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                          ],
                          alignment: AlignmentType.RIGHT,
                        })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  return Packer.toBlob(doc)
}
