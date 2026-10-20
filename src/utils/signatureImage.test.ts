import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SignatureImageError, computeOutputSize, createLatestRequestGuard,
  dataUrlWithinLimit, findInkBounds, hasMeaningfulTransparency,
  removeSignatureBackground, validateDecodedDimensions, validateSignatureFile
} from './signatureImage';
import { processSignatureFile } from './signatureImageBrowser';

function image(width: number, height: number, background: (x: number, y: number) => [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(background(x, y), (y * width + x) * 4);
  return pixels;
}
function paint(pixels: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number, color: [number, number, number, number]) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pixels.set(color, (y * width + x) * 4);
}
function pixel(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  return Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
}
function code(fn: () => unknown, expected: string) {
  assert.throws(fn, (error: unknown) => error instanceof SignatureImageError && error.code === expected);
}

test('1 white scan removes all paper, retains dark stroke, and hugs its bounds', () => {
  const p = image(80, 50, () => [255, 255, 255, 255]);
  paint(p, 80, 20, 15, 55, 16, [20, 20, 20, 255]);
  removeSignatureBackground(p, 80, 50);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 80; x++) {
    if (y >= 15 && y <= 16 && x >= 20 && x <= 55) continue;
    assert.equal(pixel(p, 80, x, y)[3], 0);
  }
  assert.ok(pixel(p, 80, 20, 15)[3] >= 230);
  assert.deepEqual(findInkBounds(p, 80, 50), { x: 20, y: 15, width: 36, height: 2 });
});

test('2 uneven lighting removes more than 99% of both paper halves while retaining stroke', () => {
  const w = 320, h = 96;
  const p = image(w, h, x => { const v = Math.round(170 + 65 * x / (w - 1)); return [v, v, v, 255]; });
  paint(p, w, 0, 45, 319, 46, [40, 40, 40, 255]);
  removeSignatureBackground(p, w, h);
  for (const [start, end] of [[0, 159], [160, 319]]) {
    let clear = 0;
    for (let y = 0; y < h; y++) if (y !== 45 && y !== 46) for (let x = start; x <= end; x++) if (pixel(p, w, x, y)[3] === 0) clear++;
    assert.ok(clear / ((end - start + 1) * (h - 2)) > .99);
  }
  assert.ok(pixel(p, w, 0, 45)[3] >= 230);
  assert.ok(pixel(p, w, 319, 45)[3] >= 230);
});

test('3 tinted paper clears and neutral dark ink remains neutral', () => {
  const p = image(80, 50, () => [200, 195, 185, 255]);
  paint(p, 80, 20, 15, 55, 16, [30, 30, 30, 255]);
  removeSignatureBackground(p, 80, 50);
  assert.equal(pixel(p, 80, 0, 0)[3], 0);
  const ink = pixel(p, 80, 30, 15);
  assert.ok(Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) <= 15);
});

test('4 blue ink keeps its blue channel against off-white paper', () => {
  const p = image(80, 50, () => [245, 240, 231, 255]);
  paint(p, 80, 20, 15, 55, 16, [30, 60, 180, 255]);
  removeSignatureBackground(p, 80, 50);
  const [r, g, b] = pixel(p, 80, 30, 15);
  assert.ok(b > r + 60 && b > g + 40);
});

test('5 faint one-pixel stroke remains continuous', () => {
  const p = image(100, 50, () => [240, 240, 240, 255]);
  paint(p, 100, 10, 20, 89, 20, [120, 120, 120, 255]);
  removeSignatureBackground(p, 100, 50);
  for (let x = 10; x <= 89; x++) assert.ok(pixel(p, 100, x, 20)[3] >= 128);
});

test('6 isolated one-to-three pixel specks are removed and do not enlarge bounds', () => {
  const p = image(100, 50, () => [0, 0, 0, 0]);
  paint(p, 100, 20, 20, 70, 21, [10, 10, 10, 255]);
  paint(p, 100, 0, 0, 2, 0, [10, 10, 10, 255]);
  assert.deepEqual(findInkBounds(p, 100, 50), { x: 20, y: 20, width: 51, height: 2 });
  assert.equal(pixel(p, 100, 1, 0)[3], 0);
});

test('7 meaningful transparency is detected without changing ink RGBA', () => {
  const p = image(40, 20, () => [0, 0, 0, 0]);
  paint(p, 40, 10, 10, 30, 11, [25, 50, 180, 173]);
  assert.equal(hasMeaningfulTransparency(p), true);
  assert.deepEqual(findInkBounds(p, 40, 20), { x: 10, y: 10, width: 21, height: 2 });
  assert.deepEqual(pixel(p, 40, 15, 10), [25, 50, 180, 173]);
  assert.equal(hasMeaningfulTransparency(image(20, 20, () => [255, 255, 255, 255])), false);
  assert.equal(hasMeaningfulTransparency(image(20, 20, (x, y) => y === 0 ? [0, 0, 0, 0] : [255, 255, 255, 255])), true);
  assert.equal(hasMeaningfulTransparency(image(20, 20, (x, y) => y === 0 && x < 19 ? [0, 0, 0, 0] : [255, 255, 255, 255])), false);
});

test('8 blank and specks-only images have no ink bounds', () => {
  const p = image(100, 50, () => [0, 0, 0, 0]);
  assert.equal(findInkBounds(p, 100, 50), null);
  paint(p, 100, 5, 5, 7, 5, [0, 0, 0, 255]);
  assert.equal(findInkBounds(p, 100, 50), null);
});

test('9 large photo dimensions pass guard and fit a 1600-pixel working canvas', () => {
  validateSignatureFile({ name: 'photo.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 });
  validateDecodedDimensions(4032, 3024);
  const scale = Math.min(1, 1600 / Math.max(4032, 3024));
  assert.equal(Math.round(4032 * scale), 1600);
  const size = computeOutputSize(1600, 50);
  assert.ok(size.width <= 600 && size.height <= 200);
});

test('10 small 120 by 40 crop gains exactly eight pixels of padding per side', () => {
  assert.deepEqual(computeOutputSize(120, 40), { width: 136, height: 56, innerWidth: 120, innerHeight: 40 });
});

test('11 output size bounds include padding and never upscale', () => {
  for (const [w, h, result] of [
    [3000, 500, [600, 113, 584, 97]], [400, 400, [200, 200, 184, 184]],
    [100, 50, [116, 66, 100, 50]], [584, 184, [600, 200, 584, 184]],
    [1, 1, [17, 17, 1, 1]]
  ] as const) {
    const actual = computeOutputSize(w, h);
    assert.deepEqual([actual.width, actual.height, actual.innerWidth, actual.innerHeight], result);
  }
});

test('12 supported formats and inclusive 15 MB limit; reject unsupported and oversized', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
    validateSignatureFile({ name: 'sig', type, size: 15 * 1024 * 1024 });
  validateSignatureFile({ name: 'sig.HEIC', type: '', size: 1 });
  validateSignatureFile({ name: 'sig.heif', type: '', size: 1 });
  for (const type of ['application/pdf', 'image/gif', 'image/svg+xml'])
    code(() => validateSignatureFile({ name: 'sig', type, size: 1 }), 'unsupported_type');
  code(() => validateSignatureFile({ name: 'sig.png', type: 'image/png', size: 15 * 1024 * 1024 + 1 }), 'too_large');
});

test('13 decoded dimensions enforce inclusive pixel and edge limits', () => {
  validateDecodedDimensions(8000, 5000);
  validateDecodedDimensions(16384, 100);
  for (const [w, h] of [[8001, 5000], [16385, 10], [0, 0], [NaN, 20], [Infinity, 2]])
    code(() => validateDecodedDimensions(w, h), 'image_too_large_pixels');
});

test('14 full data URL length is counted at the exact boundary', () => {
  const prefix = 'data:image/png;base64,';
  assert.equal(dataUrlWithinLimit(prefix + 'x'.repeat(153600 - prefix.length)), true);
  assert.equal(dataUrlWithinLimit(prefix + 'x'.repeat(153601 - prefix.length)), false);
});

test('18a latest request guard discards stale results in both resolution orders', async () => {
  const g = createLatestRequestGuard();
  const first = g.begin();
  assert.equal(g.isCurrent(first), true);
  g.invalidate();
  const second = g.begin();
  assert.ok(second > first);
  assert.equal(g.isCurrent(first), false);
  assert.equal(g.isCurrent(second), true);
  const third = g.begin();
  assert.ok(third > second);
  assert.equal(g.isCurrent(second), false);
  g.invalidate();
  assert.equal(g.isCurrent(third), false);
  for (const order of ['BA', 'AB']) {
    const applied: string[] = [];
    const deferred = () => { let resolve!: (value: string) => void; const promise = new Promise<string>(r => { resolve = r; }); return { promise, resolve }; };
    const a = deferred(), b = deferred();
    const tokenA = g.begin();
    const workA = a.promise.then(value => { if (g.isCurrent(tokenA)) applied.push(value); });
    g.invalidate();
    const tokenB = g.begin();
    const workB = b.promise.then(value => { if (g.isCurrent(tokenB)) applied.push(value); });
    for (const letter of order) { (letter === 'A' ? a : b).resolve(letter); await Promise.resolve(); }
    await Promise.all([workA, workB]);
    assert.deepEqual(applied, ['B']);
  }
});

// The browser boundary uses a small canvas double so the real processing pipeline runs in Node.
test('9 browser wrapper bounds working canvas, emits PNG, and closes bitmap', async () => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  const canvases: Array<{ width: number; height: number; drawn?: unknown[] }> = [];
  let closed = 0;
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 4032, height: 3024, close: () => { closed++; } }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      createElement: () => {
        const canvas: { width: number; height: number; drawn?: unknown[]; getContext?: () => unknown; toDataURL?: () => string } = { width: 0, height: 0 };
        canvas.getContext = () => ({
          drawImage: (...args: unknown[]) => { canvas.drawn = args; },
          getImageData: () => {
            const data = image(canvas.width, canvas.height, () => [255, 255, 255, 255]);
            paint(data, canvas.width, 100, 100, 500, 101, [20, 20, 20, 255]);
            return { data };
          },
          putImageData: () => undefined
        });
        canvas.toDataURL = () => 'data:image/png;base64,AAAA';
        canvases.push(canvas);
        return canvas;
      }
    } });
    const result = await processSignatureFile({ name: 'photo.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 } as File);
    assert.equal(canvases[0].width, 1600);
    assert.equal(canvases[0].height, 1200);
    assert.ok(result.width <= 600 && result.height <= 200);
    assert.match(result.dataUrl, /^data:image\/png;base64,/);
    assert.ok(dataUrlWithinLimit(result.dataUrl));
    assert.equal(closed, 1);
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
  }
});

test('15 corrupt decode reports decode_failed and revokes fallback object URL', async () => {
  const oldBitmap = globalThis.createImageBitmap, oldImage = globalThis.Image, oldUrl = globalThis.URL;
  let revoked = '';
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => { throw new Error('invalid'); } });
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    } });
    Object.defineProperty(globalThis, 'URL', { configurable: true, value: {
      createObjectURL: () => 'blob:signature', revokeObjectURL: (url: string) => { revoked = url; }
    } });
    await assert.rejects(processSignatureFile({ name: 'bad.heic', type: 'image/heic', size: 100 } as File),
      (error: unknown) => error instanceof SignatureImageError && error.code === 'decode_failed');
    assert.equal(revoked, 'blob:signature');
  } finally {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: oldImage });
    Object.defineProperty(globalThis, 'URL', { configurable: true, value: oldUrl });
  }
});

test('13 browser wrapper rejects decoded 40 MP overflow before canvas allocation and closes bitmap', async () => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  let closed = 0, allocated = 0;
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 8001, height: 5000, close: () => { closed++; } }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { allocated++; throw new Error('canvas must not be allocated'); } } });
    await assert.rejects(processSignatureFile({ name: 'huge.jpg', type: 'image/jpeg', size: 100 } as File),
      (error: unknown) => error instanceof SignatureImageError && error.code === 'image_too_large_pixels');
    assert.equal(allocated, 0);
    assert.equal(closed, 1);
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
  }
});

test('7 browser wrapper leaves transparent ink pixels unchanged before cropping', async () => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  let processed: Uint8ClampedArray | null = null;
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 40, height: 20, close: () => undefined }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => { const data = image(40, 20, () => [0, 0, 0, 0]); paint(data, 40, 10, 10, 30, 11, [25, 50, 180, 173]); return { data }; },
        putImageData: (rgba: { data: Uint8ClampedArray }) => { processed = rgba.data; }
      }), toDataURL: () => 'data:image/png;base64,AAAA' };
      return canvas;
    } } });
    await processSignatureFile({ name: 'transparent.png', type: 'image/png', size: 100 } as File);
    assert.ok(processed);
    assert.deepEqual(pixel(processed, 40, 15, 10), [25, 50, 180, 173]);
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
  }
});

test('8 browser wrapper reports no_ink for blank page and releases bitmap', async () => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  let closed = 0;
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 40, height: 20, close: () => { closed++; } }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 40, height: 20, getContext: () => ({
      drawImage: () => undefined,
      getImageData: () => ({ data: image(40, 20, () => [255, 255, 255, 255]) })
    }) }) } });
    await assert.rejects(processSignatureFile({ name: 'blank.png', type: 'image/png', size: 100 } as File),
      (error: unknown) => error instanceof SignatureImageError && error.code === 'no_ink');
    assert.equal(closed, 1);
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
  }
});

test('14 oversized PNG is repeatedly resized then reports too_big_output below 200 pixels', async () => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  const outputWidths: number[] = [];
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 600, height: 180, close: () => undefined }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => { const data = image(600, 180, () => [255, 255, 255, 255]); paint(data, 600, 10, 80, 590, 81, [20, 20, 20, 255]); return { data }; },
        putImageData: () => undefined
      }), toDataURL: () => { outputWidths.push(canvas.width); return 'x'.repeat(153601); } };
      return canvas;
    } } });
    await assert.rejects(processSignatureFile({ name: 'noise.png', type: 'image/png', size: 100 } as File),
      (error: unknown) => error instanceof SignatureImageError && error.code === 'too_big_output');
    assert.ok(outputWidths.length > 1);
    assert.ok(outputWidths.every(width => width >= 200));
    assert.ok(outputWidths.every((width, index) => index === 0 || width < outputWidths[index - 1]));
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
  }
});

test('12 unsupported file is rejected before any browser decoding or canvas work', async () => {
  const oldBitmap = globalThis.createImageBitmap, oldDocument = globalThis.document;
  let decoded = 0, allocated = 0;
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => { decoded++; throw new Error('unexpected decode'); } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { allocated++; throw new Error('unexpected canvas'); } } });
    await assert.rejects(processSignatureFile({ name: 'sig.svg', type: 'image/svg+xml', size: 100 } as File),
      (error: unknown) => error instanceof SignatureImageError && error.code === 'unsupported_type');
    assert.equal(decoded, 0);
    assert.equal(allocated, 0);
  } finally {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: oldBitmap });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
  }
});
