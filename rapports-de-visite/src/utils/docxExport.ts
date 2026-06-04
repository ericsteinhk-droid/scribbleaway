import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, BorderStyle, AlignmentType, HeadingLevel, Footer,
  WidthType, ShadingType, Header,
} from 'docx';
import JSZip from 'jszip';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
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

// Use the browser's Image element to get display dimensions — this correctly
// applies EXIF orientation, so portrait shots stored as landscape are handled right.
function getImageDims(dataUri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUri;
  });
}

// On Android, CapacitorHttp routes via OkHttp — bypasses WebView CORS entirely.
async function fetchPhoto(downloadUrl: string): Promise<{ uri: string; w: number; h: number } | null> {
  try {
    let base64: string;
    if (Capacitor.isNativePlatform()) {
      const resp = await CapacitorHttp.get({ url: downloadUrl, responseType: 'arraybuffer' });
      if (resp.status !== 200) return null;
      base64 = resp.data as string;
    } else {
      const response = await fetch(downloadUrl);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
      }
      base64 = btoa(binary);
    }
    const uri = 'data:image/jpeg;base64,' + base64;
    return { uri, ...await getImageDims(uri) };
  } catch {
    return null;
  }
}

function formatDateFr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function photoRows(photos: Photo[], photoMap: Map<string, { uri: string; w: number; h: number }>): (Paragraph | Table)[] {
  const DISP_W = 230; // display px per photo in 2-up layout
  const result: (Paragraph | Table)[] = [];

  for (let pi = 0; pi < photos.length; pi += 2) {
    const lp = photos[pi];
    const rp = photos[pi + 1];
    const ld = photoMap.get(lp.id);
    const rd = rp ? photoMap.get(rp.id) : undefined;

    if (!ld && !rd) continue;

    const makeCell = (d: { uri: string; w: number; h: number } | undefined, p: Photo | undefined) => {
      const cellChildren: Paragraph[] = [];
      if (d) {
        const dispH = Math.round(DISP_W * d.h / d.w);
        cellChildren.push(new Paragraph({
          children: [new ImageRun({ data: d.uri, transformation: { width: DISP_W, height: dispH } })],
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
  // Fetch all photos in parallel — no canvas, works on Android WebView
  const allPhotos = entries.flatMap((e) => e.photos);
  const photoMap = new Map<string, { uri: string; w: number; h: number }>();

  onProgress?.(0, allPhotos.length);
  let completed = 0;
  await Promise.all(allPhotos.map(async (photo) => {
    const data = await fetchPhoto(photo.url);
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

  const blob = await Packer.toBlob(doc);
  return fixDocxImageTypes(blob);
}

// docx library hardcodes ".png" extension for every ImageRun regardless of MIME type.
// Word reads the extension to determine content type, so JPEG data stored as .png renders
// as a broken image. Post-process the ZIP: rename JPEG-as-PNG files to .jpg and update rels.
async function fixDocxImageTypes(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const renamed = new Map<string, string>(); // 'media/foo.png' → 'media/foo.jpg'

  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.startsWith('word/media/') && name.endsWith('.png')) {
      const bytes = await entry.async('uint8array');
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) { // JPEG magic bytes
        const newName = name.replace(/\.png$/, '.jpg');
        renamed.set(name.slice('word/'.length), newName.slice('word/'.length));
        zip.file(newName, bytes);
        zip.remove(name);
      }
    }
  }

  if (renamed.size === 0) return blob;

  // Update all .rels files to reference the renamed files
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.endsWith('.rels')) {
      let xml = await entry.async('string');
      let changed = false;
      for (const [oldRef, newRef] of renamed) {
        if (xml.includes(oldRef)) { xml = xml.split(oldRef).join(newRef); changed = true; }
      }
      if (changed) zip.file(name, xml);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
