import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, BorderStyle, AlignmentType, HeadingLevel, Footer,
  WidthType, ShadingType, Header,
} from 'docx';
import { getBytes, ref } from 'firebase/storage';
import { storage } from '../firebase';
import { resizeImageBlob } from './imageCompression';
import type { Report, Entry } from '../types';
import { ENTRY_TYPE_LABELS } from '../types';

const TEAL = '00a99e';

const TYPE_SHADES: Record<string, string> = {
  observation: 'dbeafe',
  avancement:  'dcfce7',
  discussion:  'fef3c7',
  directive:   'fee2e2',
};

const TYPE_COLORS: Record<string, string> = {
  observation: '1d4ed8',
  avancement:  '15803d',
  discussion:  'b45309',
  directive:   'b91c1c',
};

async function fetchImageBuffer(storagePath: string, timeout = 15000): Promise<ArrayBuffer | null> {
  try {
    const storageRef = ref(storage, storagePath);
    const raw = await Promise.race([
      getBytes(storageRef),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
    ]) as ArrayBuffer;
    const blob = await resizeImageBlob(new Blob([raw], { type: 'image/jpeg' }), 800, 0.72);
    return blob.arrayBuffer();
  } catch {
    return null;
  }
}

function formatDateFr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function exportDocx(
  report: Report,
  entries: Entry[],
  projectName: string,
  projectAddress: string | undefined,
  firmName: string,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const allPhotos = entries.flatMap((e) => e.photos);
  const photoMap = new Map<string, ArrayBuffer>();

  for (let i = 0; i < allPhotos.length; i++) {
    onProgress?.(i, allPhotos.length);
    const buf = await fetchImageBuffer(allPhotos[i].storagePath);
    if (buf) photoMap.set(allPhotos[i].id, buf);
  }
  onProgress?.(allPhotos.length, allPhotos.length);

  const typeOrder: Entry['type'][] = ['observation', 'avancement', 'discussion', 'directive'];
  const grouped = typeOrder
    .map((t) => ({ type: t, entries: entries.filter((e) => e.type === t) }))
    .filter((g) => g.entries.length > 0);

  const children: (Paragraph | Table)[] = [];

  // Firm name
  children.push(
    new Paragraph({
      text: firmName,
      heading: HeadingLevel.HEADING_1,
      style: 'Heading1',
      run: { color: TEAL },
    })
  );

  // Report title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Rapport de visite #${report.number} — ${projectName}`,
          bold: true,
          size: 28,
          color: '222222',
        }),
      ],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL },
      },
      spacing: { after: 200 },
    })
  );

  // Metadata table
  const dateStr = formatDateFr(report.date);
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Projet', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Date', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Architecte', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(projectName)] }),
            new TableCell({ children: [new Paragraph(dateStr + (report.time ? ` ${report.time}` : ''))] }),
            new TableCell({ children: [new Paragraph(report.authorName)] }),
          ],
        }),
        ...(projectAddress || report.weather ? [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(projectAddress ?? '')] }),
              new TableCell({ children: [new Paragraph(report.weather ?? '')] }),
              new TableCell({ children: [new Paragraph('')] }),
            ],
          }),
        ] : []),
      ],
    })
  );
  children.push(new Paragraph({ spacing: { after: 200 } }));

  // Attendees
  if (report.attendees?.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Participants', bold: true, size: 22, color: TEAL })],
        spacing: { after: 100 },
      })
    );
    for (const a of report.attendees) {
      children.push(new Paragraph({ text: `• ${a}`, spacing: { after: 60 } }));
    }
    children.push(new Paragraph({ spacing: { after: 160 } }));
  }

  // Entry groups
  for (const group of grouped) {
    const shade = TYPE_SHADES[group.type];
    const color = TYPE_COLORS[group.type];
    const label = ENTRY_TYPE_LABELS[group.type];

    // Section header
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${label} (${group.entries.length})`,
            bold: true,
            size: 20,
            color,
          }),
        ],
        shading: { type: ShadingType.CLEAR, fill: shade },
        spacing: { before: 200, after: 120 },
      })
    );

    for (let ei = 0; ei < group.entries.length; ei++) {
      const entry = group.entries[ei];

      // Entry text
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${ei + 1}. `, bold: true, color, size: 18 }),
            new TextRun({ text: entry.content, size: 18 }),
          ],
          border: {
            left: { style: BorderStyle.SINGLE, size: 8, color: TEAL },
          },
          indent: { left: 180 },
          spacing: { after: 100 },
        })
      );

      // Photos
      for (const photo of entry.photos) {
        const buf = photoMap.get(photo.id);
        if (buf) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: buf,
                  transformation: { width: 500, height: 333 },
                }),
              ],
              indent: { left: 180 },
              spacing: { after: 60 },
            })
          );
          if (photo.caption) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: photo.caption, italics: true, color: '666666', size: 16 })],
                indent: { left: 180 },
                spacing: { after: 120 },
              })
            );
          }
        }
      }
    }
    children.push(new Paragraph({ spacing: { after: 160 } }));
  }

  // Signature block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: report.authorName, bold: true, size: 20 })],
      alignment: AlignmentType.RIGHT,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'aaaaaa' } },
      spacing: { before: 400, after: 60 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Architecte', color: '666666', size: 18 })],
      alignment: AlignmentType.RIGHT,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: { default: new Header({ children: [] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${projectName} — Rapport #${report.number} — Page`, color: '999999', size: 16 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
