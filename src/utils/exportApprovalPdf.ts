import { toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const MARGIN_MM = 8;

const withTimeout = <T,>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      value => { window.clearTimeout(timeout); resolve(value); },
      error => { window.clearTimeout(timeout); reject(error); }
    );
  });

const waitForImage = (image: HTMLImageElement): Promise<void> => {
  if (image.complete) return Promise.resolve();
  return new Promise(resolve => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
};

export async function createApprovalPdf(html: string): Promise<jsPDF> {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:1122px;height:794px;border:0;pointer-events:none;';

  try {
    const loaded = new Promise<void>((resolve, reject) => {
      frame.addEventListener('load', () => resolve(), { once: true });
      frame.addEventListener('error', () => reject(new Error('ไม่สามารถเตรียมเอกสาร PDF ได้')), { once: true });
    });
    frame.srcdoc = html.replace('<head>', `<head><base href="${window.location.origin}/">`);
    document.body.appendChild(frame);
    await withTimeout(loaded, 20000, 'เตรียมหน้าเอกสาร PDF ใช้เวลานานเกินไป');

    const content = frame.contentDocument;
    if (!content) throw new Error('ไม่สามารถเข้าถึงหน้าเอกสาร PDF ได้');
    await withTimeout(Promise.all([
      content.fonts.ready,
      ...Array.from(content.images, waitForImage)
    ]), 15000, 'โหลดรูปหรือฟอนต์สำหรับ PDF ใช้เวลานานเกินไป');

    const slides = Array.from(content.querySelectorAll<HTMLElement>('.slide-page'));
    if (slides.length === 0) throw new Error('ไม่พบหน้าเอกสารสำหรับส่งออก');

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const availableWidth = PAGE_WIDTH_MM - MARGIN_MM * 2;
    const availableHeight = PAGE_HEIGHT_MM - MARGIN_MM * 2;
    let isFirstPage = true;

    for (const slide of slides) {
      const canvas = await toCanvas(slide, { pixelRatio: 1.5, backgroundColor: '#ffffff' });
      if (canvas.width === 0 || canvas.height === 0) throw new Error('ไม่สามารถสร้างภาพหน้าเอกสารได้');
      const pixelsPerPdfPage = Math.max(1, Math.floor(canvas.width * availableHeight / availableWidth));
      const slideBounds = slide.getBoundingClientRect();
      const pixelsPerCssPixel = canvas.height / slideBounds.height;
      const safeBreaks = Array.from(slide.querySelectorAll('tr, .sig-card, .slide-header'))
        .map(element => Math.round((element.getBoundingClientRect().bottom - slideBounds.top) * pixelsPerCssPixel))
        .filter(bottom => bottom > 0 && bottom < canvas.height)
        .sort((a, b) => a - b);

      for (let top = 0; top < canvas.height;) {
        const remaining = canvas.height - top;
        let sliceHeight = Math.min(pixelsPerPdfPage, remaining);
        if (remaining > pixelsPerPdfPage) {
          const lastSafeBreak = safeBreaks.filter(bottom =>
            bottom > top + pixelsPerPdfPage * 0.6 && bottom <= top + pixelsPerPdfPage - 4
          ).at(-1);
          if (lastSafeBreak) sliceHeight = lastSafeBreak - top;
        }
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const context = slice.getContext('2d');
        if (!context) throw new Error('ไม่สามารถสร้างภาพหน้าเอกสารได้');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        if (!isFirstPage) pdf.addPage();
        isFirstPage = false;
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM,
          availableWidth, sliceHeight * availableWidth / canvas.width);
        top += sliceHeight;
      }
    }

    return pdf;
  } finally {
    frame.remove();
  }
}

export async function exportApprovalPdf(html: string, filename: string): Promise<void> {
  const pdf = await createApprovalPdf(html);
  pdf.save(filename);
}
