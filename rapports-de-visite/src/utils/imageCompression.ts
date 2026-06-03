const MAX_WIDTH = 1200;
const QUALITY = 0.75;

export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('Compression échouée'));
        },
        'image/jpeg',
        QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Impossible de charger l\'image'));
    };

    img.src = objectUrl;
  });
}

export function resizeImageBlob(blob: Blob, maxWidth: number, quality: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}
