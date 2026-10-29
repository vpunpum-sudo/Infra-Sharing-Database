import { ACCEPTED_IMAGE_TYPES, AVATAR_MAX_BYTES, MAX_SOURCE_BYTES, MAX_DECODED_PIXELS, JPEG_QUALITY_LADDER, PhotoError, checkDecodedSize, squareCropRect, targetSide, validatePhotoFile } from './profilePhoto';

/** Re-encoding pixels drops metadata, including EXIF/GPS. No preview URLs are allocated here. */
export async function resizeToAvatar(file: File): Promise<Blob> {
  const validation = validatePhotoFile(file);
  if (validation) {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new PhotoError('type');
    throw new PhotoError(file.size > MAX_SOURCE_BYTES ? 'tooLarge' : 'empty');
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new PhotoError('unreadable'); }
  try {
    if (checkDecodedSize(bitmap.width, bitmap.height)) {
      throw new PhotoError(bitmap.width * bitmap.height > MAX_DECODED_PIXELS ? 'pixels' : 'unreadable');
    }
    const crop = squareCropRect(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = targetSide(crop.side);
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('process');
    // JPEG has no alpha: transparent PNG/WebP pixels get a neutral white background.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, canvas.width, canvas.height);
    for (const quality of JPEG_QUALITY_LADDER) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob || blob.type !== 'image/jpeg' || blob.size === 0) throw new PhotoError('process');
      if (blob.size <= AVATAR_MAX_BYTES) return blob;
    }
    throw new PhotoError('shrink');
  } catch (error) {
    throw error instanceof PhotoError ? error : new PhotoError('process');
  } finally { bitmap.close(); }
}
