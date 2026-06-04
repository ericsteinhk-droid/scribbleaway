import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, BorderStyle, AlignmentType, HeadingLevel, Footer,
  WidthType, ShadingType, Header,
} from 'docx';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '../firebase';
import { resizeImageForDocument, type ResizedPhoto } from './imageCompression';
import type { Report, Entry, Photo } from '../types';
import { ENTRY_TYPE_LABELS } from '../types';

const TEAL = '00a99e';
const NONE = { style: BorderStyle.NONE, size: 0, color: 'ffffff' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

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

async function fetchPhoto(storagePath: string, timeout = 15000): Promise<ResizedPhoto | null> {
  try {
    const blob = await Promise.race([
      getBlob(ref(storage, storagePath)),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
    ]) as Blob;
    return resizeImageForDocument(blob);
  } catch {
    return null;
  }
}

function formatDateFr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function photoRows(photos: Photo[], photoMap: Map<string, ResizedPhoto>): (Paragraph | Table)[] {
  const DISP_W = 230; // display px per photo in 2-up layout
  const result: (Paragraph | Table)[] = [];

  for (let pi = 0; pi < photos.length; pi += 2) {
    const lp = photos[pi];
    const rp = photos[pi + 1];
    const ld = photoMap.get(lp.id);
    const rd = rp ? photoMap.get(rp.id) : undefined;

    if (!ld && !rd) continue;

    const makeCell = (d: ResizedPhoto | undefined, p: Photo | undefined) => {
      const cellChildren: Paragraph[] = [];
      if (d) {
        const h = Math.round(DISP_W * d.height / d.width);
        cellChildren.push(new Paragraph({
          children: [new ImageRun({ data: d.dataUrl, transformation: { width: DISP_W, height: h } })],
          spacing: { after: p?.caption ? 40 : 80 },
        }));
        if (p?.caption) {
          cellChildren.push(new Paragraph({
            children: [new TextRun({ text: p.caption, italics: true, size: 14, color: '888888' })],
            spacing: { after: 80 },
          }));
        }
      } else {
        cellChildren.push(new Paragraph(''));
      }
      return new TableCell({
        children: cellChildren,
        width: { size: 50, type: WidthType.PERCENTAGE },
        margins: { right: 80 },
        borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
      });
    };

    result.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [makeCell(ld, lp), makeCell(rd, rp)] })],
      borders: NO_BORDERS,
    }));
  }

  return result;
}

export async function exportDocx(
  report: Report,
  entries: Entry[],
  projectName: string,
  projectAddress: string | undefined,
  firmName: string,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  // Fetch all photos in parallel
  const allPhotos = entries.flatMap((e) => e.photos);
  const photoMap = new Map<string, ResizedPhoto>();

  onProgress?.(0, allPhotos.length);
  let completed = 0;
  await Promise.all(allPhotos.map(async (photo) => {
    const data = await fetchPhoto(photo.storagePath);
    if (data) photoMap.set(photo.id, data);
    onProgress?.(++completed, allPhotos.length);
  }));

  const typeOrder: Entry['type'][] = ['observation', 'avancement', 'discussion', 'directive'];
  const grouped = typeOrder
    .map((t) => ({ type: t, entries: entries.filter((e) => e.type === t) }))
    .filter((g) => g.entries.length > 0);

  const children: (Paragraph | Table)[] = [];

  // Header: firm name
  children.push(new Paragraph({
    text: firmName,
    heading: HeadingLevel.HEADING_1,
    style: 'Heading1',
    run: { color: TEAL },
  }));

  // Report title
  children.push(new Paragraph({
    children: [new TextRun({
      text: `Rapport de visite #${report.number} — ${projectName}`,
      bold: true, size: 28, color: '222222',
    })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL } },
    spacing: { after: 200 },
  }));

  // Metadata table
  const dateStr = formatDateFr(report.date) + (report.time ? ` ${report.time}` : '');
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Projet', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Date', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } }),
        ...(report.weather ? [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Météo', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } })] : []),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Architecte', bold: true, size: 18 })] })], shading: { type: ShadingType.CLEAR, fill: 'f0fdfa' } }),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph(projectAddress ? `${projectName}\n${projectAddress}` : projectName)] }),
        new TableCell({ children: [new Paragraph(dateStr)] }),
        ...(report.weather ? [new TableCell({ children: [new Paragraph(report.weather)] })] : []),
        new TableCell({ children: [new Paragraph(report.authorName)] }),
      ] }),
    ],
  }));
  children.push(new Paragraph({ spacing: { after: 200 } }));

  // Attendees
  if (report.attendees?.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Participants', bold: true, size: 22, color: TEAL })],
      spacing: { after: 100 },
    }));
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

    children.push(new Paragraph({
      children: [new TextRun({ text: `${label} (${group.entries.length})`, bold: true, size: 20, color })],
      shading: { type: ShadingType.CLEAR, fill: shade },
      spacing: { before: 200, after: 120 },
    }));

    for (let ei = 0; ei < group.entries.length; ei++) {
      const entry = group.entries[ei];

      // Entry text with left accent border
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${ei + 1}. `, bold: true, color, size: 18 }),
          new TextRun({ text: entry.content, size: 18 }),
        ],
        border: { left: { style: BorderStyle.SINGLE, size: 8, color: TEAL } },
        indent: { left: 180 },
        spacing: { after: entry.photos.length > 0 ? 80 : 140 },
      }));

      // Photos: 2-up table matching PDF layout
      children.push(...photoRows(entry.photos, photoMap));
      if (entry.photos.length > 0) {
        children.push(new Paragraph({ spacing: { after: 80 } }));
      }
    }
    children.push(new Paragraph({ spacing: { after: 160 } }));
  }

  // Signature
  children.push(new Paragraph({
    children: [new TextRun({ text: report.authorName, bold: true, size: 20 })],
    alignment: AlignmentType.RIGHT,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'aaaaaa' } },
    spacing: { before: 400, after: 60 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Architecte', color: '666666', size: 18 })],
    alignment: AlignmentType.RIGHT,
  }));

  const doc = new Document({
    sections: [{
      properties: {},
      headers: { default: new Header({ children: [] }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [new TextRun({ text: `${projectName} — Rapport #${report.number}`, color: '999999', size: 16 })],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
