import { useEffect, useRef, useState } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import type { Photo } from '../../types';

interface Props {
  photo: Photo;
  storagePath: string;
  onSave: (updatedPhoto: Photo) => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

export default function PhotoAnnotator({ photo, storagePath, onSave, onClose, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const drawing = useRef(false);
  const historyRef = useRef<ImageData[]>([]);
  const baseRef = useRef<ImageData | null>(null);

  useEffect(() => { loadAndDraw(); }, []);

  async function loadAndDraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      let base64: string;
      if (Capacitor.isNativePlatform()) {
        const resp = await CapacitorHttp.get({ url: photo.url, responseType: 'arraybuffer' });
        base64 = 'data:image/jpeg;base64,' + resp.data;
      } else {
        const resp = await fetch(photo.url);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
        base64 = 'data:image/jpeg;base64,' + btoa(binary);
      }
      const img = new Image();
      img.onload = () => {
        const maxW = Math.min(window.innerWidth - 16, 900);
        const maxH = window.innerHeight - 160;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        baseRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setLoading(false);
      };
      img.onerror = () => { onError('Impossible de charger la photo.'); onClose(); };
      img.src = base64;
    } catch {
      onError('Impossible de charger la photo.');
      onClose();
    }
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const pos = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = '#FF3300';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function onPointerUp(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.closePath();
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current = [...historyRef.current, snap];
    setCanUndo(true);
  }

  function handleUndo() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const h = historyRef.current.slice(0, -1);
    historyRef.current = h;
    setCanUndo(h.length > 0);
    if (h.length > 0) {
      ctx.putImageData(h[h.length - 1], 0, 0);
    } else if (baseRef.current) {
      ctx.putImageData(baseRef.current, 0, 0);
    }
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92)
      );
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}_ann`;
      const path = `${storagePath}/${id}.jpg`;
      const sRef = storageRef(storage, path);
      const url = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, blob, { contentType: 'image/jpeg' });
        const timer = setTimeout(() => { task.cancel(); reject(new Error('Upload timeout')); }, 30000);
        task.on('state_changed', null,
          (err) => { clearTimeout(timer); reject(err); },
          async () => { clearTimeout(timer); resolve(await getDownloadURL(task.snapshot.ref)); }
        );
      });
      onSave({ ...photo, url, storagePath: path });
    } catch {
      onError("Erreur lors de la sauvegarde de l'annotation.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
        <button
          onClick={onClose}
          className="text-gray-300 text-sm px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600"
        >
          Annuler
        </button>
        <span className="text-white text-sm font-medium">Annotation</span>
        <div className="flex items-center gap-2">
          {canUndo && (
            <button
              onClick={handleUndo}
              className="text-gray-300 text-sm px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600"
            >
              ↩ Défaire
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="text-white text-sm font-medium px-4 py-1.5 rounded-lg bg-evoq hover:bg-evoq-dark disabled:opacity-60"
          >
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-gray-950 p-2">
        {loading && (
          <div className="w-8 h-8 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
        )}
        <canvas
          ref={canvasRef}
          className={loading ? 'hidden' : ''}
          style={{ touchAction: 'none', cursor: 'crosshair', maxWidth: '100%', maxHeight: '100%' }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />
      </div>

      <div
        className="px-4 py-2 bg-gray-900 shrink-0"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <p className="text-center text-xs text-gray-500">Dessinez en rouge • Glissez pour annoter</p>
      </div>
    </div>
  );
}
