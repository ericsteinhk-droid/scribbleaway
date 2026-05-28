import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../firebase';
import { compressImage } from '../../utils/imageCompression';
import type { Photo } from '../../types';

interface Props {
  photos: Photo[];
  storagePath: string;
  onPhotosChange: (photos: Photo[]) => void;
  onError: (msg: string) => void;
}

function CameraIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function PhotoGrid({ photos, storagePath, onPhotosChange, onError }: Props) {
  const webCameraRef = useRef<HTMLInputElement>(null);
  const webGalleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [editCaptionId, setEditCaptionId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');

  const isNative = Capacitor.isNativePlatform();

  async function uploadBlob(blob: Blob, index: number, total: number): Promise<Photo | null> {
    setUploadProgress(`${index} / ${total}`);
    try {
      const compressed = await compressImage(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const path = `${storagePath}/${id}.jpg`;
      const sRef = storageRef(storage, path);

      return new Promise((resolve) => {
        const task = uploadBytesResumable(sRef, compressed, { contentType: 'image/jpeg' });
        const timer = setTimeout(() => { task.cancel(); resolve(null); }, 30000);
        task.on('state_changed', null,
          () => { clearTimeout(timer); resolve(null); },
          async () => {
            clearTimeout(timer);
            const url = await getDownloadURL(task.snapshot.ref);
            resolve({ id, url, storagePath: path, caption: '' });
          }
        );
      });
    } catch {
      return null;
    }
  }

  // ── Native camera (Capacitor) ──────────────────────────────────────────
  async function handleNativeCamera() {
    try {
      const photo = await Camera.getPhoto({
        quality: 75,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      if (!photo.dataUrl) return;
      setUploading(true);
      const resp = await fetch(photo.dataUrl);
      const blob = await resp.blob();
      const newPhoto = await uploadBlob(blob, 1, 1);
      if (newPhoto) onPhotosChange([...photos, newPhoto]);
      else onError('Erreur lors du chargement de la photo.');
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (!msg.includes('cancelled') && !msg.includes('cancel')) {
        onError('Impossible d\'ouvrir l\'appareil photo.');
      }
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }

  async function handleNativeGallery() {
    try {
      const result = await Camera.pickImages({ quality: 75, limit: 20 });
      if (!result.photos.length) return;
      setUploading(true);
      const newPhotos: Photo[] = [];
      for (let i = 0; i < result.photos.length; i++) {
        const p = result.photos[i];
        const src = p.webPath ?? p.path ?? '';
        if (!src) continue;
        const resp = await fetch(src);
        const blob = await resp.blob();
        const newPhoto = await uploadBlob(blob, i + 1, result.photos.length);
        if (newPhoto) newPhotos.push(newPhoto);
      }
      if (newPhotos.length) onPhotosChange([...photos, ...newPhotos]);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (!msg.includes('cancelled') && !msg.includes('cancel')) {
        onError('Impossible d\'accéder à la galerie.');
      }
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }

  // ── Web fallback (file input) ──────────────────────────────────────────
  async function handleWebFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newPhotos: Photo[] = [];
    for (let i = 0; i < files.length; i++) {
      const newPhoto = await uploadBlob(files[i], i + 1, files.length);
      if (newPhoto) newPhotos.push(newPhoto);
      else onError(`Erreur lors du chargement de la photo ${i + 1}.`);
    }
    if (newPhotos.length) onPhotosChange([...photos, ...newPhotos]);
    setUploading(false);
    setUploadProgress('');
  }

  async function handleDelete(photo: Photo) {
    try { await deleteObject(storageRef(storage, photo.storagePath)); } catch { /* already gone */ }
    onPhotosChange(photos.filter((p) => p.id !== photo.id));
    setDeleteTarget(null);
  }

  function startEditCaption(photo: Photo) {
    setEditCaptionId(photo.id);
    setCaptionDraft(photo.caption ?? '');
  }

  function saveCaption(photoId: string) {
    onPhotosChange(photos.map((p) => p.id === photoId ? { ...p, caption: captionDraft } : p));
    setEditCaptionId(null);
  }

  return (
    <div>
      {/* Upload buttons */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={isNative ? handleNativeCamera : () => webCameraRef.current?.click()}
          disabled={uploading}
          aria-label="Prendre une photo"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          <CameraIcon /> Appareil photo
        </button>
        <button
          type="button"
          onClick={isNative ? handleNativeGallery : () => webGalleryRef.current?.click()}
          disabled={uploading}
          aria-label="Choisir dans la galerie"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          <GalleryIcon /> Galerie
        </button>
        {uploading && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
            {uploadProgress}
          </span>
        )}
      </div>

      {/* Web-only hidden file inputs */}
      {!isNative && (
        <>
          <input ref={webCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => handleWebFiles(e.target.files)} />
          <input ref={webGalleryRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => handleWebFiles(e.target.files)} />
        </>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative">
              <img src={photo.url} alt={photo.caption || 'Photo'} className="w-full aspect-[4/3] object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => setDeleteTarget(photo)}
                aria-label="Supprimer la photo"
                className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {editCaptionId === photo.id ? (
                <input type="text" value={captionDraft} onChange={(e) => setCaptionDraft(e.target.value)}
                  onBlur={() => saveCaption(photo.id)} onKeyDown={(e) => e.key === 'Enter' && saveCaption(photo.id)}
                  autoFocus className="mt-1 w-full text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-evoq"
                  placeholder="Légende…" />
              ) : (
                <button type="button" onClick={() => startEditCaption(photo)}
                  className="mt-1 text-xs text-gray-400 hover:text-evoq w-full text-left truncate">
                  {photo.caption || '+ légende'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-5 mx-4 shadow-2xl max-w-xs w-full">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Supprimer cette photo ? Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">Annuler</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
