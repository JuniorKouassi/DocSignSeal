// The main pdfjs-dist build fails under this Node version (a hashing utility
// mismatch); the legacy build is what its own Node.js code path recommends
// and is confirmed working here.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

/* Rasterizes PDF pages to PNG -- the only place a page becomes a raster
   image anywhere in DocSignSeal; flatten.mjs (in the main app) never
   rasterizes the signed output, per HANDOFF.md's non-negotiable #4.

   Lives in its own container (docsignseal/containers/render-service/)
   rather than the main Next.js app because @napi-rs/canvas is a native
   addon: it cannot run inside a Cloudflare Worker's V8 isolate, which has
   no OS-level dynamic library loading. This runs as a plain Node process
   in a Cloudflare Container instead, reached over HTTP (see server.mjs).

   pdfjs-dist auto-detects Node and uses @napi-rs/canvas for its own internal
   scratch canvases (masks, patterns), but the page's *output* canvas is
   always supplied by the caller -- there is no browser <canvas> here, so we
   create one directly with the same library.

   Known gap: no standardFontDataUrl is configured, so pages using non-
   embedded standard fonts fall back to a generic substitute. Harmless for
   this preview image; flatten.mjs (the actual signed output, in the main
   app) embeds real fonts and is unaffected. */

export async function getPageCount(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const count = doc.numPages;
  await task.destroy();
  return count;
}

export async function renderPageToPng(bytes, pageNumber, scale = 1.5) {
  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    return canvas.toBuffer('image/png');
  } finally {
    await task.destroy();
  }
}
