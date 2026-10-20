import {
  SignatureImageError, computeOutputSize, dataUrlWithinLimit, findInkBounds,
  hasMeaningfulTransparency, removeSignatureBackground, validateDecodedDimensions,
  validateSignatureFile
} from './signatureImage';

export interface ProcessedSignature { dataUrl: string; width: number; height: number }

/** Decode only in the browser. The pure pixel operations live in signatureImage.ts. */
export async function processSignatureFile(file: File): Promise<ProcessedSignature> {
  validateSignatureFile(file);
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  try {
    let source: ImageBitmap | HTMLImageElement;
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        // Safari/Chrome differ on HEIC support; the image-element path may still decode it.
      }
    }
    if (bitmap) {
      source = bitmap;
    } else {
      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new SignatureImageError('decode_failed'));
        image.src = objectUrl!;
      });
      source = image;
    }
    const sourceWidth = bitmap ? bitmap.width : (source as HTMLImageElement).naturalWidth;
    const sourceHeight = bitmap ? bitmap.height : (source as HTMLImageElement).naturalHeight;
    validateDecodedDimensions(sourceWidth, sourceHeight);

    const working = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    working.width = Math.max(1, Math.round(sourceWidth * scale));
    working.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = working.getContext('2d');
    if (!context) throw new SignatureImageError('decode_failed');
    context.drawImage(source, 0, 0, working.width, working.height);
    const rgba = context.getImageData(0, 0, working.width, working.height);
    if (!hasMeaningfulTransparency(rgba.data)) {
      removeSignatureBackground(rgba.data, working.width, working.height);
    }
    const bounds = findInkBounds(rgba.data, working.width, working.height);
    if (!bounds) throw new SignatureImageError('no_ink');
    context.putImageData(rgba, 0, 0);

    const initial = computeOutputSize(bounds.width, bounds.height);
    let innerWidth = initial.innerWidth, innerHeight = initial.innerHeight;
    while (true) {
      const output = document.createElement('canvas');
      output.width = innerWidth + 16;
      output.height = innerHeight + 16;
      const outputContext = output.getContext('2d');
      if (!outputContext) throw new SignatureImageError('decode_failed');
      outputContext.drawImage(working, bounds.x, bounds.y, bounds.width, bounds.height,
        8, 8, innerWidth, innerHeight);
      const dataUrl = output.toDataURL('image/png');
      if (dataUrlWithinLimit(dataUrl)) {
        return { dataUrl, width: output.width, height: output.height };
      }
      const nextWidth = Math.max(1, Math.floor(innerWidth * .75));
      const nextHeight = Math.max(1, Math.floor(innerHeight * .75));
      if (Math.max(nextWidth + 16, nextHeight + 16) < 200 ||
          (nextWidth === innerWidth && nextHeight === innerHeight)) {
        throw new SignatureImageError('too_big_output');
      }
      innerWidth = nextWidth;
      innerHeight = nextHeight;
    }
  } catch (error) {
    if (error instanceof SignatureImageError) throw error;
    throw new SignatureImageError('decode_failed');
  } finally {
    bitmap?.close();
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  }
}
