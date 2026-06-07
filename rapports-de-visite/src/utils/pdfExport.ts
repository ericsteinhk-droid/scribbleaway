import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { blobToDataUrl } from './imageCompression';
import type { Report, Entry, Letterhead } from '../types';
import { ENTRY_TYPE_LABELS } from '../types';

const TEAL = '#00a99e';
const PAGE_W = 215.9; // US Letter mm
const PAGE_H = 279.4;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

const TYPE_COLORS: Record<string, [number, number, number]> = {
  observation:  [59,  130, 246],
  avancement:   [34,  197, 94],
  discussion:   [245, 158, 11],
  directive:    [239, 68,  68],
};

// Parse JPEG dimensions from raw bytes (finds SOF marker).
function parseJpegDims(bytes: Uint8Array): { w: number; h: number } {
  let i = 2; // skip SOI (FF D8)
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xFF) break;
    const marker = bytes[i + 1];
    // SOF markers: C0-CF except C4 (DHT), C8, CC
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      if (w > 0 && h > 0) return { w, h };
    }
    if (marker === 0xD9 || marker === 0xDA) break;
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return { w: 4, h: 3 }; // fallback — 4:3 landscape
}

// On Android, CapacitorHttp routes via OkHttp — bypasses WebView CORS entirely.
// On web, plain fetch works fine.
async function fetchPhoto(downloadUrl: string): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    let bytes: Uint8Array;
    if (Capacitor.isNativePlatform()) {
      const resp = await CapacitorHttp.get({ url: downloadUrl, responseType: 'arraybuffer' });
      if (resp.status !== 200) return null;
      const binary = atob(resp.data as string);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      const response = await fetch(downloadUrl);
      if (!response.ok) return null;
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    return { bytes, ...parseJpegDims(bytes) };
  } catch {
    return null;
  }
}

async function fetchLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const resp = await fetch('/evoq_logo.png');
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // PNG IHDR: signature (8) + length (4) + "IHDR" (4) + width (4) + height (4)
    const w = bytes.length >= 24 ? (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0 : 0;
    const h = bytes.length >= 24 ? (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0 : 0;
    const dataUrl = await blobToDataUrl(new Blob([buf], { type: 'image/png' }));
    if (!dataUrl) return null;
    return { dataUrl, w: w || 1, h: h || 1 };
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export async function exportPdf(
  report: Report,
  entries: Entry[],
  projectName: string,
  projectAddress: string | undefined,
  letterhead: Letterhead = 'evoq',
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  // Fetch all photo bytes in parallel — Uint8Array, no Blob/FileReader/canvas needed
  const allPhotos = entries.flatMap((e) => e.photos);
  const photoMap = new Map<string, { bytes: Uint8Array; w: number; h: number }>();

  onProgress?.(0, allPhotos.length);
  let completed = 0;
  await Promise.all(allPhotos.map(async (photo) => {
    const data = await fetchPhoto(photo.url);
    if (data) photoMap.set(photo.id, data);
    onProgress?.(++completed, allPhotos.length);
  }));

  const logo = letterhead === 'evoq' ? await fetchLogo() : null;
  const totalPages = () => (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();

  const typeOrder: Entry['type'][] = ['observation', 'avancement', 'discussion', 'directive'];
  const grouped = typeOrder
    .map((t) => ({ type: t, entries: entries.filter((e) => e.type === t) }))
    .filter((g) => g.entries.length > 0);

  const [tr, tg, tb] = hexToRgb(TEAL);

  // Returns separator Y
  function addHeader(pageNum: number): number {
    if (letterhead === 'evoq') {
      if (logo) {
        const logoW = 30;
        const logoH = logoW * (logo.h / logo.w);
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, 10, logoW, logoH);
        const textY = Math.max(24, 10 + logoH + 3);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text('EVOQ architecture', MARGIN, textY);
        doc.text('1435, rue Saint-Alexandre, bureau 1000, Montr\xE9al (Qu\xE9bec) H3A 2G4 \xB7 T. 514.393.9490', MARGIN, textY + 4);
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(tr, tg, tb);
      doc.text(`Rapport de visite #${report.number}`, PAGE_W - MARGIN, 14, { align: 'right' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(projectName, PAGE_W - MARGIN, 20, { align: 'right' });
      if (projectAddress) doc.text(projectAddress, PAGE_W - MARGIN, 25, { align: 'right' });

      doc.setDrawColor(tr, tg, tb);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 34, PAGE_W - MARGIN, 34);

      if (pageNum === 1) {
        const [y, m, d] = report.date.split('-').map(Number);
        const dateStr = new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
        const meta = [
          ['Date', dateStr + (report.time ? ` ${report.time}` : '')],
          ...(report.weather ? [['M\xE9t\xE9o', report.weather]] : []),
          ['Architecte', report.authorName],
        ];
        let mx = MARGIN;
        const mw = CONTENT_W / meta.length;
        doc.setFontSize(8);
        for (const [label, value] of meta) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(120, 120, 120);
          doc.text(label, mx, 39);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 30, 30);
          doc.text(value, mx, 44);
          mx += mw;
        }
      }
      return 34;
    } else {
      // nfoe-evoq
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('N\xB7F\xB7O\xB7E+EVOQ', MARGIN, 20);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Consortium NFOE | EVOQ architecture', PAGE_W - MARGIN, 12, { align: 'right' });

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 110, 110);
      doc.text('T. 514.397.2616  \xB7  F. 514.861.5242', PAGE_W - MARGIN, 18, { align: 'right' });
      doc.text('361, rue Saint-Jacques, bureau 1500', PAGE_W - MARGIN, 23.5, { align: 'right' });
      doc.text('Montr\xE9al, Qu\xE9bec  H2Y 0K2', PAGE_W - MARGIN, 29, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(tr, tg, tb);
      doc.text(`Rapport de visite #${report.number}`, PAGE_W - MARGIN, 38, { align: 'right' });

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(projectName, PAGE_W - MARGIN, 44, { align: 'right' });
      if (projectAddress) doc.text(projectAddress, PAGE_W - MARGIN, 49.5, { align: 'right' });

      doc.setDrawColor(tr, tg, tb);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 54, PAGE_W - MARGIN, 54);

      if (pageNum === 1) {
        const [y, m, d] = report.date.split('-').map(Number);
        const dateStr = new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
        const meta = [
          ['Date', dateStr + (report.time ? ` ${report.time}` : '')],
          ...(report.weather ? [['M\xE9t\xE9o', report.weather]] : []),
          ['Architecte', report.authorName],
        ];
        let mx = MARGIN;
        const mw = CONTENT_W / meta.length;
        doc.setFontSize(8);
        for (const [label, value] of meta) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(120, 120, 120);
          doc.text(label, mx, 59);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 30, 30);
          doc.text(value, mx, 64);
          mx += mw;
        }
      }
      return 54;
    }
  }

  function addFooter() {
    const total = totalPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(projectName, MARGIN, PAGE_H - 8);
      doc.text(`Rapport #${report.number}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
      doc.text(`Page ${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
    }
  }

  addHeader(1);
  const headerContentStart = letterhead === 'evoq' ? 50 : 70;
  // On subsequent pages (no metadata block), content starts right after header separator
  const headerResetY = letterhead === 'evoq' ? 42 : 62;
  let curY = headerContentStart;

  // Attendees
  if (report.attendees?.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(tr, tg, tb);
    doc.text('Participants', MARGIN, curY);
    curY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    for (const a of report.attendees) {
      doc.text(`• ${a}`, MARGIN + 3, curY);
      curY += 5;
    }
    curY += 4;
  }

  // Entry groups
  for (const group of grouped) {
    const [cr, cg, cb] = TYPE_COLORS[group.type];
    const label = ENTRY_TYPE_LABELS[group.type];

    if (curY > PAGE_H - 40) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = headerResetY; }

    doc.setFillColor(cr, cg, cb);
    doc.rect(MARGIN, curY - 4, CONTENT_W, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${label} (${group.entries.length})`, MARGIN + 3, curY + 1);
    curY += 10;

    for (let ei = 0; ei < group.entries.length; ei++) {
      const entry = group.entries[ei];

      if (curY > PAGE_H - 30) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = headerResetY; }

      // Entry text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(cr, cg, cb);
      doc.text(`${ei + 1}.`, MARGIN, curY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(entry.content, CONTENT_W - 8) as string[];
      doc.text(lines, MARGIN + 6, curY);
      curY += lines.length * 4.5 + 3;

      // Photos: 2 per row, constant height so portrait photos don't create wasted vertical space
      if (entry.photos.length > 0) {
        const PHOTO_H = 55;   // mm — all photos share this height; width varies with aspect ratio
        const PHOTO_GAP = 4;  // mm between photos in the same row

        for (let pi = 0; pi < entry.photos.length; pi += 2) {
          const lp = entry.photos[pi];
          const rp = entry.photos[pi + 1];
          const ld = photoMap.get(lp.id);
          const rd = rp ? photoMap.get(rp.id) : undefined;

          if (!ld && !rd) continue;

          let rowH = PHOTO_H;
          let lW = ld ? rowH * (ld.w / ld.h) : 0;
          let rW = rd ? rowH * (rd.w / rd.h) : 0;

          // Scale the pair down proportionally if they're too wide together
          if (ld && rd) {
            const totalW = lW + PHOTO_GAP + rW;
            if (totalW > CONTENT_W) {
              const scale = (CONTENT_W - PHOTO_GAP) / (lW + rW);
              lW *= scale; rW *= scale; rowH *= scale;
            }
          } else if (ld && lW > CONTENT_W) {
            rowH *= CONTENT_W / lW; lW = CONTENT_W;
          } else if (rd && rW > CONTENT_W) {
            rowH *= CONTENT_W / rW; rW = CONTENT_W;
          }

          if (curY + rowH + 10 > PAGE_H - 15) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = headerResetY; }

          if (ld) {
            doc.addImage(ld.bytes, 'JPEG', MARGIN, curY, lW, rowH);
            if (lp.caption) {
              doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
              doc.text(lp.caption, MARGIN, curY + rowH + 3);
            }
          }
          if (rd) {
            doc.addImage(rd.bytes, 'JPEG', MARGIN + lW + PHOTO_GAP, curY, rW, rowH);
            if (rp?.caption) {
              doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
              doc.text(rp.caption, MARGIN + lW + PHOTO_GAP, curY + rowH + 3);
            }
          }

          curY += rowH + (lp.caption || rp?.caption ? 8 : 4);
        }
        curY += 2;
      }
    }
    curY += 4;
  }

  // Signature
  if (curY > PAGE_H - 40) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = headerResetY; }
  curY += 8;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(PAGE_W - MARGIN - 60, curY, PAGE_W - MARGIN, curY);
  curY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text(report.authorName, PAGE_W - MARGIN, curY, { align: 'right' });
  curY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Architecte', PAGE_W - MARGIN, curY, { align: 'right' });

  addFooter();
  return doc.output('blob');
}

export async function exportGroupedPdf(
  visitsData: Array<{ report: Report; entries: Entry[] }>,
  projectName: string,
  projectAddress: string | undefined,
  letterhead: Letterhead = 'evoq',
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  // Sort by report number ascending
  const sorted = [...visitsData].sort((a, b) => a.report.number - b.report.number);

  // Fetch all photos across all reports
  const allPhotos = sorted.flatMap((v) => v.entries.flatMap((e) => e.photos));
  const photoMap = new Map<string, { bytes: Uint8Array; w: number; h: number }>();

  onProgress?.(0, allPhotos.length);
  let completed = 0;
  await Promise.all(allPhotos.map(async (photo) => {
    const data = await fetchPhoto(photo.url);
    if (data) photoMap.set(photo.id, data);
    onProgress?.(++completed, allPhotos.length);
  }));

  const logo = letterhead === 'evoq' ? await fetchLogo() : null;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const totalPages = () => (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  const [tr, tg, tb] = hexToRgb(TEAL);

  // Grouped header: same layout but right side shows "Rapports groupés" instead of a report number
  function addGroupedHeader(): number {
    if (letterhead === 'evoq') {
      if (logo) {
        const logoW = 30;
        const logoH = logoW * (logo.h / logo.w);
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, 10, logoW, logoH);
        const textY = Math.max(24, 10 + logoH + 3);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text('EVOQ architecture', MARGIN, textY);
        doc.text('1435, rue Saint-Alexandre, bureau 1000, Montr\xE9al (Qu\xE9bec) H3A 2G4 \xB7 T. 514.393.9490', MARGIN, textY + 4);
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(tr, tg, tb);
      doc.text('Rapports group\xE9s', PAGE_W - MARGIN, 14, { align: 'right' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(projectName, PAGE_W - MARGIN, 20, { align: 'right' });
      if (projectAddress) doc.text(projectAddress, PAGE_W - MARGIN, 25, { align: 'right' });

      doc.setDrawColor(tr, tg, tb);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 34, PAGE_W - MARGIN, 34);
      return 34;
    } else {
      // nfoe-evoq
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('N\xB7F\xB7O\xB7E+EVOQ', MARGIN, 20);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Consortium NFOE | EVOQ architecture', PAGE_W - MARGIN, 12, { align: 'right' });

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 110, 110);
      doc.text('T. 514.397.2616  \xB7  F. 514.861.5242', PAGE_W - MARGIN, 18, { align: 'right' });
      doc.text('361, rue Saint-Jacques, bureau 1500', PAGE_W - MARGIN, 23.5, { align: 'right' });
      doc.text('Montr\xE9al, Qu\xE9bec  H2Y 0K2', PAGE_W - MARGIN, 29, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(tr, tg, tb);
      doc.text('Rapports group\xE9s', PAGE_W - MARGIN, 38, { align: 'right' });

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(projectName, PAGE_W - MARGIN, 44, { align: 'right' });
      if (projectAddress) doc.text(projectAddress, PAGE_W - MARGIN, 49.5, { align: 'right' });

      doc.setDrawColor(tr, tg, tb);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 54, PAGE_W - MARGIN, 54);
      return 54;
    }
  }

  function addGroupedFooter(label: string) {
    const total = totalPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(projectName, MARGIN, PAGE_H - 8);
      doc.text(label, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
      doc.text(`Page ${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
    }
  }

  const headerResetY = letterhead === 'evoq' ? 42 : 62;
  const headerContentStart = letterhead === 'evoq' ? 42 : 62;

  addGroupedHeader();
  let curY = headerContentStart;

  // Show report range summary at the top
  const nums = sorted.map((v) => v.report.number);
  const firstNum = nums[0];
  const lastNum = nums[nums.length - 1];
  const rangeLabel = sorted.length <= 4
    ? 'Rapports #' + nums.join(', #')
    : `Rapports #${firstNum} \xE0 #${lastNum}`;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(tr, tg, tb);
  doc.text(rangeLabel, MARGIN, curY);
  curY += 8;

  // Iterate over each visit
  for (const visit of sorted) {
    const { report, entries } = visit;

    const typeOrder: Entry['type'][] = ['observation', 'avancement', 'discussion', 'directive'];
    const grouped = typeOrder
      .map((t) => ({ type: t, entries: entries.filter((e) => e.type === t) }))
      .filter((g) => g.entries.length > 0);

    // Visit section band
    if (curY > PAGE_H - 40) { doc.addPage(); addGroupedHeader(); curY = headerResetY; }

    const [y, m, d] = report.date.split('-').map(Number);
    const dateStr = new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    const visitLabel = `Rapport #${report.number} — ${dateStr}`;

    doc.setFillColor(tr, tg, tb);
    doc.rect(MARGIN, curY - 5, CONTENT_W, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(visitLabel, MARGIN + 3, curY + 1.5);
    curY += 13;

    // Attendees for this visit
    if (report.attendees?.length > 0) {
      if (curY > PAGE_H - 30) { doc.addPage(); addGroupedHeader(); curY = headerResetY; }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(tr, tg, tb);
      doc.text('Participants', MARGIN, curY);
      curY += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(9);
      for (const a of report.attendees) {
        doc.text(`• ${a}`, MARGIN + 3, curY);
        curY += 5;
      }
      curY += 3;
    }

    // Entry groups
    for (const group of grouped) {
      const [cr, cg, cb] = TYPE_COLORS[group.type];
      const label = ENTRY_TYPE_LABELS[group.type];

      if (curY > PAGE_H - 40) { doc.addPage(); addGroupedHeader(); curY = headerResetY; }

      doc.setFillColor(cr, cg, cb);
      doc.rect(MARGIN, curY - 4, CONTENT_W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`${label} (${group.entries.length})`, MARGIN + 3, curY + 1);
      curY += 10;

      for (let ei = 0; ei < group.entries.length; ei++) {
        const entry = group.entries[ei];

        if (curY > PAGE_H - 30) { doc.addPage(); addGroupedHeader(); curY = headerResetY; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(cr, cg, cb);
        doc.text(`${ei + 1}.`, MARGIN, curY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        const lines = doc.splitTextToSize(entry.content, CONTENT_W - 8) as string[];
        doc.text(lines, MARGIN + 6, curY);
        curY += lines.length * 4.5 + 3;

        if (entry.photos.length > 0) {
          const PHOTO_H = 55;
          const PHOTO_GAP = 4;

          for (let pi = 0; pi < entry.photos.length; pi += 2) {
            const lp = entry.photos[pi];
            const rp = entry.photos[pi + 1];
            const ld = photoMap.get(lp.id);
            const rd = rp ? photoMap.get(rp.id) : undefined;

            if (!ld && !rd) continue;

            let rowH = PHOTO_H;
            let lW = ld ? rowH * (ld.w / ld.h) : 0;
            let rW = rd ? rowH * (rd.w / rd.h) : 0;

            if (ld && rd) {
              const totalW = lW + PHOTO_GAP + rW;
              if (totalW > CONTENT_W) {
                const scale = (CONTENT_W - PHOTO_GAP) / (lW + rW);
                lW *= scale; rW *= scale; rowH *= scale;
              }
            } else if (ld && lW > CONTENT_W) {
              rowH *= CONTENT_W / lW; lW = CONTENT_W;
            } else if (rd && rW > CONTENT_W) {
              rowH *= CONTENT_W / rW; rW = CONTENT_W;
            }

            if (curY + rowH + 10 > PAGE_H - 15) { doc.addPage(); addGroupedHeader(); curY = headerResetY; }

            if (ld) {
              doc.addImage(ld.bytes, 'JPEG', MARGIN, curY, lW, rowH);
              if (lp.caption) {
                doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
                doc.text(lp.caption, MARGIN, curY + rowH + 3);
              }
            }
            if (rd) {
              doc.addImage(rd.bytes, 'JPEG', MARGIN + lW + PHOTO_GAP, curY, rW, rowH);
              if (rp?.caption) {
                doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
                doc.text(rp.caption, MARGIN + lW + PHOTO_GAP, curY + rowH + 3);
              }
            }

            curY += rowH + (lp.caption || rp?.caption ? 8 : 4);
          }
          curY += 2;
        }
      }
      curY += 4;
    }
    curY += 6;
  }

  const footerLabel = sorted.length <= 4
    ? 'Rapports #' + sorted.map((v) => v.report.number).join(', #')
    : `Rapports #${firstNum}–#${lastNum}`;
  addGroupedFooter(footerLabel);
  return doc.output('blob');
}
