export type SignatureImageErrorCode =
  | 'unsupported_type' | 'too_large' | 'decode_failed' | 'image_too_large_pixels' | 'no_ink' | 'too_big_output';

export class SignatureImageError extends Error {
  constructor(public readonly code: SignatureImageErrorCode) {
    super(code);
    this.name = 'SignatureImageError';
  }
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 16_384;
const BACKGROUND_DARKNESS = .10;
const SOLID_INK_DARKNESS = .35;
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

export function validateSignatureFile(file: { name: string; type: string; size: number }): void {
  if (!SUPPORTED_TYPES.has(file.type.toLowerCase()) && !(file.type === '' && /\.hei[cf]$/i.test(file.name))) {
    throw new SignatureImageError('unsupported_type');
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
    throw new SignatureImageError('too_large');
  }
}

export function validateDecodedDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new SignatureImageError('image_too_large_pixels');
  }
}

export function hasMeaningfulTransparency(pixels: Uint8ClampedArray): boolean {
  const count = Math.floor(pixels.length / 4);
  if (!count) return false;
  let transparent = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 16) transparent++;
  return transparent / count >= .05;
}

function luminance(r: number, g: number, b: number) {
  return .299 * r + .587 * g + .114 * b;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

interface PaperTile { luminance: number; r: number; g: number; b: number }

/** Mutates the RGBA buffer, replacing paper with transparency. */
export function removeSignatureBackground(pixels: Uint8ClampedArray, width: number, height: number): void {
  const tileSize = Math.max(16, Math.ceil(Math.max(width, height) / 16));
  const columns = Math.ceil(width / tileSize), rows = Math.ceil(height / tileSize);
  const tiles: PaperTile[] = [];
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
    const values: number[] = [];
    for (let y = ty * tileSize; y < Math.min(height, (ty + 1) * tileSize); y++) {
      for (let x = tx * tileSize; x < Math.min(width, (tx + 1) * tileSize); x++) {
        const i = (y * width + x) * 4;
        values.push(luminance(pixels[i], pixels[i + 1], pixels[i + 2]));
      }
    }
    values.sort((a, b) => a - b);
    const paperL = values[Math.floor((values.length - 1) * .9)];
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = ty * tileSize; y < Math.min(height, (ty + 1) * tileSize); y++) {
      for (let x = tx * tileSize; x < Math.min(width, (tx + 1) * tileSize); x++) {
        const i = (y * width + x) * 4;
        if (luminance(pixels[i], pixels[i + 1], pixels[i + 2]) >= paperL * .95) {
          r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
        }
      }
    }
    tiles.push({ luminance: paperL, r: r / n, g: g / n, b: b / n });
  }
  const interpolate = (x: number, y: number): PaperTile => {
    const gx = Math.max(0, Math.min(columns - 1, (x + .5) / tileSize - .5));
    const gy = Math.max(0, Math.min(rows - 1, (y + .5) / tileSize - .5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(columns - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1);
    const fx = gx - x0, fy = gy - y0;
    const a = tiles[y0 * columns + x0], b = tiles[y0 * columns + x1];
    const c = tiles[y1 * columns + x0], d = tiles[y1 * columns + x1];
    const blend = (key: keyof PaperTile) =>
      (a[key] * (1 - fx) + b[key] * fx) * (1 - fy) + (c[key] * (1 - fx) + d[key] * fx) * fy;
    return { luminance: blend('luminance'), r: blend('r'), g: blend('g'), b: blend('b') };
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const paper = interpolate(x, y);
    const darkness = 1 - luminance(pixels[i], pixels[i + 1], pixels[i + 2]) / Math.max(1, paper.luminance);
    const t = Math.max(0, Math.min(1, (darkness - BACKGROUND_DARKNESS) / (SOLID_INK_DARKNESS - BACKGROUND_DARKNESS)));
    const smooth = t * t * (3 - 2 * t);
    if (smooth === 0) { pixels[i + 3] = 0; continue; }
    const alpha = smooth * pixels[i + 3] / 255;
    for (const [offset, bg] of [[0, paper.r], [1, paper.g], [2, paper.b]] as const) {
      const balanced = pixels[i + offset] * 255 / Math.max(1, bg);
      // Remove the paper-coloured contribution at semitransparent edges.
      pixels[i + offset] = clampByte(alpha < 1 ? (balanced - (1 - alpha) * 255) / Math.max(alpha, .01) : balanced);
    }
    pixels[i + 3] = clampByte(smooth * pixels[i + 3]);
  }
}

export interface InkBounds { x: number; y: number; width: number; height: number }

/** Finds substantial connected ink and removes small disconnected noise in place. */
export function findInkBounds(
  pixels: Uint8ClampedArray, width: number, height: number,
  opts: { minAlpha?: number; minComponentPixels?: number } = {}
): InkBounds | null {
  const minAlpha = opts.minAlpha ?? 64;
  const minSize = opts.minComponentPixels ?? Math.max(4, Math.ceil(.00005 * width * height));
  const visited = new Uint8Array(width * height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 0; index < width * height; index++) {
    if (visited[index] || pixels[index * 4 + 3] < minAlpha) continue;
    const component = [index];
    visited[index] = 1;
    for (let q = 0; q < component.length; q++) {
      const current = component[q], x = current % width, y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (!visited[neighbour] && pixels[neighbour * 4 + 3] >= minAlpha) {
          visited[neighbour] = 1;
          component.push(neighbour);
        }
      }
    }
    if (component.length < minSize) {
      for (const i of component) pixels[i * 4 + 3] = 0;
      continue;
    }
    for (const i of component) {
      const x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export interface SignatureOutputSize { width: number; height: number; innerWidth: number; innerHeight: number }

export function computeOutputSize(cropW: number, cropH: number, maxW = 600, maxH = 200, padding = 8): SignatureOutputSize {
  const availableW = maxW - padding * 2, availableH = maxH - padding * 2;
  if (cropW <= 0 || cropH <= 0 || availableW < 1 || availableH < 1) throw new RangeError('Invalid output dimensions');
  const scale = Math.min(1, availableW / cropW, availableH / cropH);
  const innerWidth = Math.max(1, Math.round(cropW * scale));
  const innerHeight = Math.max(1, Math.round(cropH * scale));
  return { width: innerWidth + padding * 2, height: innerHeight + padding * 2, innerWidth, innerHeight };
}

export function dataUrlWithinLimit(dataUrl: string, maxChars = 153600): boolean {
  return dataUrl.length <= maxChars;
}

export function createLatestRequestGuard() {
  let counter = 0, current: number | null = null;
  return {
    begin(): number { current = ++counter; return current; },
    isCurrent(token: number): boolean { return current !== null && token === current; },
    invalidate(): void { counter++; current = null; }
  };
}
