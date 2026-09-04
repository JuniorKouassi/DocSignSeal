import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createHash } from 'node:crypto';

/* DocSignSeal flattening engine.

   Takes the original PDF plus the annotations placed on it, and writes the
   signed PDF. The original content stream is never touched, so the result stays
   vector, stays searchable, and prints identically to the source. */

const INK = {
  blue:  rgb(0.106, 0.247, 0.659),
  black: rgb(0.063, 0.063, 0.063),
  green: rgb(0.059, 0.361, 0.204),
  red:   rgb(0.659, 0.106, 0.106)
};

function hexToRgb(hex) {
  const h = (hex || '#1B3FA8').replace('#', '');
  return rgb(parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255);
}

/* Percent to PDF points.

   Two traps live here. PDF's origin is the bottom left, while every UI in the
   world places from the top left, so y must be flipped. And a page can carry a
   /Rotate value, in which case the visible width and height are swapped from
   what getSize() reports. Get either wrong and everything lands in the margin. */
function place(page, a) {
  const { width, height } = page.getSize();
  const rot = page.getRotation().angle % 360;
  const swapped = rot === 90 || rot === 270;
  const vw = swapped ? height : width;
  const vh = swapped ? width : height;

  const w = (a.w / 100) * vw;
  const h = (a.h / 100) * vh;
  const x = (a.x / 100) * vw;
  const yTop = (a.y / 100) * vh;

  return { x, y: vh - yTop - h, w, h, vw, vh };
}

/* Which pages does this annotation land on?
   applied_to_all_pages is stored as one row, not duplicated per page, so that
   moving it later moves every copy. */
function targetPages(pdf, a) {
  if (!a.applied_to_all_pages) return [a.page - 1];
  const total = pdf.getPageCount();
  const from = (a.page_from ?? 1) - 1;
  const to   = (a.page_to ?? total) - 1;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export async function flatten({
  sourceBytes,
  annotations = [],
  assets = {},          // { [file_id]: Uint8Array } for signature and stamp images
  fontBytes = null,     // a Unicode TTF. Required for anything beyond Latin-1.
  certificate = null    // { documentTitle, documentId, signers, events }
}) {
  const pdf = await PDFDocument.load(sourceBytes);

  let font;
  if (fontBytes) {
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(fontBytes, { subset: true });
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  /* Embed each image once, however many times it is placed. A seal stamped on
     nineteen pages must not mean nineteen copies of the same PNG in the file. */
  const embedded = new Map();
  async function image(fileId) {
    if (embedded.has(fileId)) return embedded.get(fileId);
    const bytes = assets[fileId];
    if (!bytes) throw new Error(`Missing asset ${fileId}`);
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    embedded.set(fileId, img);
    return img;
  }

  const ordered = [...annotations].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));

  for (const a of ordered) {
    for (const pageIndex of targetPages(pdf, a)) {
      const page = pdf.getPage(pageIndex);
      const box = place(page, a);
      const color = a.ink_color ? hexToRgb(a.ink_color) : INK.blue;
      const rotation = degrees(a.rotation ?? 0);

      if (a.type === 'signature' || a.type === 'initials' || a.type === 'stamp') {
        const img = await image(a.ref_file_id);
        const scale = Math.min(box.w / img.width, box.h / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        /* Centered in the box, not anchored to its corner: the aspect-ratio-
           preserving scale above almost never fills the box exactly (a wide,
           short signature in a taller box, say), and the preview
           (AnnotateView.module.css's .markImg, object-fit: contain) already
           centers the leftover space evenly on both sides. Anchoring here
           instead put the image flush against the box's corner in the
           downloaded PDF while the live preview showed it centered -- same
           box, two different results, which is what a signature "shifting
           left" between the annotate view and the sealed download actually
           was. */
        page.drawImage(img, {
          x: box.x + (box.w - drawWidth) / 2,
          y: box.y + (box.h - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight,
          rotate: rotation,
          opacity: a.opacity ?? 1
        });
      }

      else if (a.type === 'date' || a.type === 'text' || a.type === 'fullname') {
        const size = a.font_size ?? Math.min(box.h * 0.7, 12);
        page.drawText(String(a.value_text ?? ''), {
          x: box.x,
          y: box.y + (box.h - size) / 2,
          size,
          font,
          color,
          rotate: rotation
        });
      }

      else if (a.type === 'checkbox') {
        if (a.value_text) {
          const s = Math.min(box.w, box.h);
          page.drawLine({
            start: { x: box.x + s * 0.15, y: box.y + s * 0.5 },
            end:   { x: box.x + s * 0.42, y: box.y + s * 0.2 },
            thickness: 1.6, color
          });
          page.drawLine({
            start: { x: box.x + s * 0.42, y: box.y + s * 0.2 },
            end:   { x: box.x + s * 0.88, y: box.y + s * 0.82 },
            thickness: 1.6, color
          });
        }
      }

      else if (a.type === 'ink' && Array.isArray(a.stroke_data)) {
        /* Freehand is drawn as real vector paths, not as a rasterised image.
           stroke_data holds arrays of {x, y} in percent of the field box. */
        for (const stroke of a.stroke_data) {
          for (let i = 1; i < stroke.length; i++) {
            page.drawLine({
              start: { x: box.x + stroke[i-1].x / 100 * box.w, y: box.y + box.h - stroke[i-1].y / 100 * box.h },
              end:   { x: box.x + stroke[i].x   / 100 * box.w, y: box.y + box.h - stroke[i].y   / 100 * box.h },
              thickness: a.thickness ?? 1.6,
              color
            });
          }
        }
      }
    }
  }

  if (certificate) await appendCertificate(pdf, certificate, font);

  pdf.setProducer('DocSignSeal');
  pdf.setModificationDate(new Date());

  const out = await pdf.save({ useObjectStreams: true });
  const sha256 = createHash('sha256').update(out).digest('hex');
  return { bytes: out, sha256 };
}

/* The certificate of completion. This page, not the signature image, is what
   makes the document defensible. Print it in a monospaced-friendly layout and
   keep every timestamp in UTC alongside any local rendering. */
async function appendCertificate(pdf, cert, font) {
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]); // A4
  let y = 780;
  const L = 56;
  const ink = rgb(0.09, 0.14, 0.30);
  const muted = rgb(0.35, 0.40, 0.52);

  const line = (text, { size = 10, f = font, color = ink, gap = 14 } = {}) => {
    if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 780; }
    page.drawText(text, { x: L, y, size, font: f, color });
    y -= gap;
  };

  line('Certificate of completion', { size: 16, f: bold, gap: 26 });
  line(cert.documentTitle, { size: 11, f: bold, gap: 16 });
  line(`Document ID  ${cert.documentId}`, { color: muted, gap: 22 });

  line('Signers', { size: 11, f: bold, gap: 16 });
  for (const s of cert.signers) {
    line(`${s.name}  <${s.email}>`, { gap: 13 });
    line(`   ${s.status} · ${s.signed_at ?? 'not signed'} · ${s.auth_method} · IP ${s.ip ?? 'n/a'}`,
         { size: 9, color: muted, gap: 17 });
  }

  y -= 8;
  line('Audit trail', { size: 11, f: bold, gap: 16 });
  for (const e of cert.events) {
    line(`${e.created_at}  ${e.event}`, { size: 9, gap: 12 });
    if (e.actor) line(`   ${e.actor}${e.ip ? ' · ' + e.ip : ''}`, { size: 9, color: muted, gap: 13 });
  }

  y -= 10;
  line('Each audit entry is chained to the previous one by SHA-256. Any alteration',
       { size: 8.5, color: muted, gap: 11 });
  line('of an earlier entry invalidates every hash that follows it.',
       { size: 8.5, color: muted, gap: 11 });
}
