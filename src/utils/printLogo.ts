/** Trim empty margins from configured logos before putting them in equal PDF slots. */
export async function normalizePrintLogo(url: string, fallbackUrl: string): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;

  try {
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return fallbackUrl;

    const scale = Math.min(1, 800 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallbackUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        const alpha = pixels[offset + 3];
        // Uploaded logos may have either transparent or solid white padding.
        const visible = alpha > 24 && (
          alpha < 245 ||
          Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 238
        );
        if (!visible) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return fallbackUrl;
    const trimmed = document.createElement('canvas');
    trimmed.width = right - left + 1;
    trimmed.height = bottom - top + 1;
    trimmed.getContext('2d')?.drawImage(canvas, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    return trimmed.toDataURL('image/png');
  } catch {
    // A remote logo without CORS permission cannot be read through canvas.
    return fallbackUrl;
  }
}
