import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function shareOrDownload(blob: Blob, filename: string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);

    // Try External first, fall back to Cache
    let uri: string;
    let directory: Directory;
    try {
      const r = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.External });
      uri = r.uri;
      directory = Directory.External;
    } catch (extErr) {
      let r;
      try {
        r = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      } catch (cacheErr) {
        throw new Error('writeFile ext=' + (extErr instanceof Error ? extErr.message : String(extErr))
          + ' cache=' + (cacheErr instanceof Error ? cacheErr.message : String(cacheErr)));
      }
      uri = r.uri;
      directory = Directory.Cache;
    }

    try {
      await Share.share({ files: [uri], title: filename, dialogTitle: 'Partager le fichier' });
    } catch (shareErr) {
      throw new Error('Share uri=' + uri + ' err=' + (shareErr instanceof Error ? shareErr.message : String(shareErr)));
    }
    Filesystem.deleteFile({ path: filename, directory }).catch(() => {});
    return;
  }

  // Web / PWA fallback: try Web Share API, then force-download
  const file = new File([blob], filename, { type: mimeType });
  if (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
