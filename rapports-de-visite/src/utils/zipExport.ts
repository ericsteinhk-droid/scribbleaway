import JSZip from 'jszip';
import type { Entry } from '../types';
import { ENTRY_TYPE_LABELS } from '../types';

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export async function exportZip(
  entries: Entry[],
  reportNumber: number,
  projectName: string,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const allPhotos = entries.flatMap((e, ei) =>
    e.photos.map((p, pi) => ({ photo: p, entryIndex: ei, photoIndex: pi, type: e.type }))
  );

  if (allPhotos.length === 0) {
    throw new Error('Ce rapport ne contient aucune photo.');
  }

  const zip = new JSZip();

  onProgress?.(0, allPhotos.length);
  let completed = 0;
  await Promise.all(allPhotos.map(async ({ photo, entryIndex, photoIndex, type }) => {
    try {
      const response = await fetch(photo.url);
      if (response.ok) {
        const bytes = await response.arrayBuffer();
        const folder = slugify(ENTRY_TYPE_LABELS[type]);
        const filename = `${String(entryIndex + 1).padStart(2, '0')}_${String(photoIndex + 1).padStart(2, '0')}.jpg`;
        zip.folder(folder)!.file(filename, bytes);
      }
    } catch {
      // skip failed photos
    }
    onProgress?.(++completed, allPhotos.length);
  }));

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
