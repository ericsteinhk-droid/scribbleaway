import JSZip from 'jszip';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../firebase';
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

  for (let i = 0; i < allPhotos.length; i++) {
    onProgress?.(i, allPhotos.length);
    const { photo, entryIndex, photoIndex, type } = allPhotos[i];
    const folder = slugify(ENTRY_TYPE_LABELS[type]);
    const filename = `${String(entryIndex + 1).padStart(2, '0')}_${String(photoIndex + 1).padStart(2, '0')}.jpg`;

    try {
      const storageRef = ref(storage, photo.storagePath);
      const url = await getDownloadURL(storageRef);
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      zip.folder(folder)!.file(filename, blob);
    } catch {
      // Skip failed photos
    }
  }

  onProgress?.(allPhotos.length, allPhotos.length);

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
