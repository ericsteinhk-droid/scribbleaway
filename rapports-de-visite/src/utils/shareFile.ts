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

async function writeNativeFile(filename: string, data: string): Promise<{ uri: string; directory: Directory }> {
  // Prefer app-specific external storage — content URIs from this path work better
  // with email clients (ClipData permission propagation). Fall back to internal cache
  // if external storage is not mounted.
  try {
    const result = await Filesystem.writeFile({ path: filename, data, directory: Directory.External });
    return { uri: result.uri, directory: Directory.External };
  } catch {
    const result = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    return { uri: result.uri, directory: Directory.Cache };
  }
}

export async function shareOrDownload(blob: Blob, filename: string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const { uri, directory } = await writeNativeFile(filename, base64);
    await Share.share({ files: [uri], title: filename, dialogTitle: 'Partager le fichier' });
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
