import { createFiberLoopSvg } from './fiberLoopIcon';
import { buildProjectKml, KmlIcon, KmlInput } from './kml';
import { createZip } from './zip';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Icon could not be loaded'));
    image.src = src;
  });
}

async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Icon could not be drawn');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Draws one map icon as a PNG (enclosure image, enclosure dot, or loop SVG). */
async function rasterise(icon: KmlIcon): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = icon.size;
  const context = canvas.getContext('2d')!;
  if (icon.kind === 'circle') {
    context.fillStyle = icon.color;
    context.beginPath();
    context.arc(icon.size / 2, icon.size / 2, icon.size / 2, 0, Math.PI * 2);
    context.fill();
    return canvasPng(canvas);
  }
  const src = icon.kind === 'loop'
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createFiberLoopSvg(icon.color).replace('width="100%" height="100%"', `width="${icon.size}" height="${icon.size}"`))}`
    : icon.src;
  const image = await loadImage(src);
  // Fit inside the square like the map's object-fit: contain.
  const scale = Math.min(icon.size / image.naturalWidth, icon.size / image.naturalHeight) || 1;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (icon.size - width) / 2, (icon.size - height) / 2, width, height);
  return canvasPng(canvas);
}

/** A KMZ: doc.kml plus the PNG icons it references. */
export async function buildProjectKmz(input: KmlInput): Promise<Blob> {
  const { kml, icons } = buildProjectKml(input);
  const files = await Promise.all(icons.map(async icon => {
    try {
      return { name: icon.href, data: await rasterise(icon) };
    } catch (error) {
      // A broken type icon falls back to Google Earth's default pin.
      console.warn('KMZ icon skipped', icon.href, error);
      return null;
    }
  }));
  const zip = createZip([
    { name: 'doc.kml', data: new TextEncoder().encode(kml) },
    ...files.filter((file): file is { name: string; data: Uint8Array } => !!file)
  ]);
  return new Blob([zip], { type: 'application/vnd.google-earth.kmz' });
}
