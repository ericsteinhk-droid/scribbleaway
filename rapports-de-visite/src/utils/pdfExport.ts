import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '../firebase';
import { resizeImageForDocument, type ResizedPhoto } from './imageCompression';
import type { Report, Entry } from '../types';
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

async function fetchPhoto(storagePath: string): Promise<ResizedPhoto | null> {
  try {
    const blob = await getBlob(ref(storage, storagePath));
    return resizeImageForDocument(blob);
  } catch {
    return null;
  }
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch('/evoq_logo.png');
    const blob = await resp.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
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
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  // Fetch all photos in parallel, resized and aspect-ratio preserved
  const allPhotos = entries.flatMap((e) => e.photos);
  const photoMap = new Map<string, ResizedPhoto>();

  onProgress?.(0, allPhotos.length);
  let completed = 0;
  await Promise.all(allPhotos.map(async (photo) => {
    const data = await fetchPhoto(photo.storagePath);
    if (data) photoMap.set(photo.id, data);
    onProgress?.(++completed, allPhotos.length);
  }));

  const logoDataUrl = await fetchLogoDataUrl();
  const totalPages = () => (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();

  const typeOrder: Entry['type'][] = ['observation', 'avancement', 'discussion', 'directive'];
  const grouped = typeOrder
    .map((t) => ({ type: t, entries: entries.filter((e) => e.type === t) }))
    .filter((g) => g.entries.length > 0);

  function addHeader(pageNum: number) {
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 12, 30, 10);
    }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const [tr, tg, tb] = hexToRgb(TEAL);
    doc.setTextColor(tr, tg, tb);
    doc.text(`Rapport de visite #${report.number}`, PAGE_W - MARGIN, 14, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(projectName, PAGE_W - MARGIN, 20, { align: 'right' });
    if (projectAddress) doc.text(projectAddress, PAGE_W - MARGIN, 25, { align: 'right' });

    doc.setDrawColor(tr, tg, tb);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 32, PAGE_W - MARGIN, 32);

    if (pageNum === 1) {
      const [y, m, d] = report.date.split('-').map(Number);
      const dateStr = new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
      const meta = [
        ['Date', dateStr + (report.time ? ` ${report.time}` : '')],
        ...(report.weather ? [['Météo', report.weather]] : []),
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
  let curY = 50;

  // Attendees
  if (report.attendees?.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const [tr, tg, tb] = hexToRgb(TEAL);
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

    if (curY > PAGE_H - 40) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = 42; }

    doc.setFillColor(cr, cg, cb);
    doc.rect(MARGIN, curY - 4, CONTENT_W, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${label} (${group.entries.length})`, MARGIN + 3, curY + 1);
    curY += 10;

    for (let ei = 0; ei < group.entries.length; ei++) {
      const entry = group.entries[ei];

      if (curY > PAGE_H - 30) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = 42; }

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

      // Photos: 2 per row, preserving actual aspect ratio
      if (entry.photos.length > 0) {
        const photoW = (CONTENT_W - 6) / 2;

        for (let pi = 0; pi < entry.photos.length; pi += 2) {
          const lp = entry.photos[pi];
          const rp = entry.photos[pi + 1];
          const ld = photoMap.get(lp.id);
          const rd = rp ? photoMap.get(rp.id) : undefined;

          // Compute row height from whichever image is taller
          const lH = ld ? photoW * (ld.height / ld.width) : 0;
          const rH = rd ? photoW * (rd.height / rd.width) : 0;
          const rowH = Math.max(lH, rH, photoW * 0.56);

          if (curY + rowH + 10 > PAGE_H - 15) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = 42; }

          if (ld) {
            const h = photoW * (ld.height / ld.width);
            doc.addImage(ld.dataUrl, 'JPEG', MARGIN, curY, photoW, h);
            if (lp.caption) {
              doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
              doc.text(lp.caption, MARGIN, curY + h + 3);
            }
          }
          if (rd) {
            const h = photoW * (rd.height / rd.width);
            doc.addImage(rd.dataUrl, 'JPEG', MARGIN + photoW + 6, curY, photoW, h);
            if (rp?.caption) {
              doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
              doc.text(rp.caption, MARGIN + photoW + 6, curY + h + 3);
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
  if (curY > PAGE_H - 40) { doc.addPage(); addHeader(doc.getNumberOfPages()); curY = 42; }
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
