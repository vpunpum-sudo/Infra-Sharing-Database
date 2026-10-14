import { toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const MARGIN_MM = 8;

type PixelRange = { start: number; end: number };

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
      const pixelRange = (element: Element): PixelRange => {
        const bounds = element.getBoundingClientRect();
        return {
          start: Math.max(0, Math.round((bounds.top - slideBounds.top) * pixelsPerCssPixel)),
          end: Math.min(canvas.height, Math.round((bounds.bottom - slideBounds.top) * pixelsPerCssPixel))
        };
      };
      const tables = Array.from(slide.querySelectorAll('table')).flatMap(table => {
        const heading = table.querySelector('thead');
        if (!heading) return [];
        const routeHeading = table.classList.contains('pdf-enclosure-table')
          ? table.closest('.pdf-route')?.querySelector('.pdf-route-heading')
          : null;
        return [{ table: pixelRange(table), heading: pixelRange(heading), routeHeading: routeHeading ? pixelRange(routeHeading) : null }];
      });
      const keepTogether: PixelRange[] = Array.from(slide.querySelectorAll('.pdf-keep-together, .sig-grid, .sig-card, .slide-header, table thead, table tbody tr, table tfoot tr'))
        .map(pixelRange);

      // Never leave a table heading alone at the bottom of a page.
      slide.querySelectorAll('table').forEach(table => {
        const heading = table.querySelector('thead');
        const firstRow = table.querySelector('tbody tr');
        if (heading && firstRow) {
          keepTogether.push({ start: pixelRange(heading).start, end: pixelRange(firstRow).end });
        }
      });

      // Keep each route introduction, table heading and first row on the same page.
      slide.querySelectorAll('.pdf-route').forEach(route => {
        const intro = route.querySelector('.pdf-route-intro');
        const firstRow = route.querySelector('.pdf-enclosure-table tbody tr');
        if (intro && firstRow) {
          keepTogether.push({ start: pixelRange(intro).start, end: pixelRange(firstRow).end });
        }
      });
      const safeBreaks = Array.from(new Set([
        ...keepTogether.flatMap(range => [range.start, range.end]),
        ...Array.from(slide.querySelectorAll('table')).map(table => pixelRange(table).end)
      ])).filter(position => position > 0 && position < canvas.height).sort((a, b) => a - b);

      for (let top = 0; top < canvas.height;) {
        const continuedTable = tables.find(table =>
          top >= table.heading.end - 2 && top < table.table.end - 2
        );
        const repeatedHeaders = continuedTable
          ? [continuedTable.routeHeading, continuedTable.heading].filter((range): range is PixelRange => !!range)
          : [];
        const repeatedHeight = repeatedHeaders.reduce((sum, range) => sum + range.end - range.start, 0);
        const contentCapacity = pixelsPerPdfPage - repeatedHeight;
        if (contentCapacity <= 0) throw new Error('หัวตาราง PDF สูงเกินพื้นที่หน้า');

        const limit = Math.min(canvas.height, top + contentCapacity);
        let bottom = limit;
        if (limit < canvas.height) {
          const crossing = keepTogether
            .filter(range => range.start > top + 2 && range.start < limit - 2 &&
              range.end > limit + 2 && range.end - range.start <= contentCapacity)
            .sort((a, b) => a.start - b.start)[0];
          if (crossing) {
            bottom = crossing.start;
          } else {
            const lastSafeBreak = safeBreaks.filter(position =>
              position > top + contentCapacity * 0.6 && position <= limit - 4
            ).at(-1);
            if (lastSafeBreak) bottom = lastSafeBreak;
          }
        }
        // A single oversized item cannot fit on one page, so make forward progress.
        if (bottom <= top + 2) bottom = limit;

        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = repeatedHeight + bottom - top;
        const context = slice.getContext('2d');
        if (!context) throw new Error('ไม่สามารถสร้างภาพหน้าเอกสารได้');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, slice.width, slice.height);
        let offset = 0;
        for (const header of repeatedHeaders) {
          const height = header.end - header.start;
          context.drawImage(canvas, 0, header.start, canvas.width, height, 0, offset, canvas.width, height);
          offset += height;
        }
        context.drawImage(canvas, 0, top, canvas.width, bottom - top, 0, offset, canvas.width, bottom - top);

        if (!isFirstPage) pdf.addPage();
        isFirstPage = false;
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM,
          availableWidth, slice.height * availableWidth / canvas.width);
        top = bottom;
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
