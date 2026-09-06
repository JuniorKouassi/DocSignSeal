/* Client-side only -- shared by lib/signatures/toPng.ts (gallery/scan
   signatures) and the stamp upload form: normalises any picked image into
   a plain PNG blob, with its near-white background stripped so the result
   pastes onto a document as just the ink/mark, not an opaque rectangle.
   Plain pixel math on a canvas, not a real background-removal model --
   works for the common case (a dark signature or stamp meaningfully darker
   than its own surrounding paper), not for a background that isn't lighter
   than the mark at all (e.g. colored paper close in tone to the ink). */

// Grid resolution for local background estimation -- see
// removeNearWhiteBackground's comment for why this needs to be local
// (per-region) rather than one brightness for the whole photo.
const TILES = 12;
// How far below a region's estimated background brightness the gradient
// from "paper" to "untouched ink" spans.
const GRADIENT_RANGE = 35;
// Safety margin above the estimated background level: real paper isn't
// perfectly flat, so treating pixels slightly darker than the estimate
// (not just brighter-or-equal) as fully transparent avoids leaving a faint
// halo from ordinary paper-texture/anti-aliasing noise.
const TRANSPARENT_MARGIN = 6;
// An estimated regional background darker than this is almost certainly
// the ink itself (e.g. a tile that's mostly covered by a large stamp) --
// clamping is safer than thresholding relative to what's actually the
// mark's own color.
const MIN_PLAUSIBLE_BACKGROUND = 130;

/* A single global "background brightness" for the whole photo -- even one
   sampled from the photo itself rather than assumed to be pure white --
   still fails whenever the photo's lighting isn't flat across the frame:
   a real handheld phone photo commonly has a shadow or brightness falloff
   from one side to the other, so paper near a shadowed edge can measure
   40-70 brightness levels darker than paper near a brighter one. Any
   single cutoff is either too strict for the dim end (leaves it visibly
   opaque -- the reported bug) or too loose for the bright end (eats into
   faint ink).

   Splitting the image into a grid and estimating "what does background
   measure as here" independently per tile adapts to that gradient instead
   of averaging over it. Each tile's own 85th-percentile brightness is used
   as its local background guess: even a tile mostly covered by ink still
   has some visible border/gap of actual paper in it at that percentile,
   for any reasonably-sized grid relative to the mark. */
function computeTileBackgrounds(data: Uint8ClampedArray, width: number, height: number): { tileBg: number[]; tileW: number; tileH: number } {
  const tileW = width / TILES;
  const tileH = height / TILES;
  const buckets: number[][] = Array.from({ length: TILES * TILES }, () => []);

  for (let y = 0; y < height; y++) {
    const ty = Math.min(TILES - 1, Math.floor(y / tileH));
    for (let x = 0; x < width; x++) {
      const tx = Math.min(TILES - 1, Math.floor(x / tileW));
      const i = (y * width + x) * 4;
      buckets[ty * TILES + tx].push(Math.min(data[i], data[i + 1], data[i + 2]));
    }
  }

  const tileBg = buckets.map((samples) => {
    samples.sort((a, b) => a - b);
    return Math.max(MIN_PLAUSIBLE_BACKGROUND, samples[Math.floor(samples.length * 0.85)]);
  });

  return { tileBg, tileW, tileH };
}

// Bilinear interpolation between tile centers so the threshold changes
// smoothly across the image instead of visibly stepping at tile
// boundaries.
function localBackgroundAt(tileBg: number[], tileW: number, tileH: number, x: number, y: number): number {
  const fx = x / tileW - 0.5;
  const fy = y / tileH - 0.5;
  const tx0 = Math.max(0, Math.min(TILES - 1, Math.floor(fx)));
  const ty0 = Math.max(0, Math.min(TILES - 1, Math.floor(fy)));
  const tx1 = Math.min(TILES - 1, tx0 + 1);
  const ty1 = Math.min(TILES - 1, ty0 + 1);
  const ax = Math.max(0, Math.min(1, fx - tx0));
  const ay = Math.max(0, Math.min(1, fy - ty0));

  const v00 = tileBg[ty0 * TILES + tx0];
  const v10 = tileBg[ty0 * TILES + tx1];
  const v01 = tileBg[ty1 * TILES + tx0];
  const v11 = tileBg[ty1 * TILES + tx1];
  const top = v00 * (1 - ax) + v10 * ax;
  const bottom = v01 * (1 - ax) + v11 * ax;
  return top * (1 - ay) + bottom * ay;
}

function removeNearWhiteBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const { tileBg, tileW, tileH } = computeTileBackgrounds(data, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const backgroundBrightness = localBackgroundAt(tileBg, tileW, tileH, x, y);
      const fullyTransparentAt = backgroundBrightness - TRANSPARENT_MARGIN;
      const fullyOpaqueBelow = fullyTransparentAt - GRADIENT_RANGE;

      const brightness = Math.min(data[i], data[i + 1], data[i + 2]);
      if (brightness >= fullyTransparentAt) {
        data[i + 3] = 0;
      } else if (brightness > fullyOpaqueBelow) {
        const t = (brightness - fullyOpaqueBelow) / (fullyTransparentAt - fullyOpaqueBelow);
        data[i + 3] = Math.round(data[i + 3] * (1 - t));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/* Caps the longest edge so a 12MP camera photo doesn't turn into a
   multi-megabyte signature/stamp asset. Takes a Blob, not specifically a
   File -- a scan that's already gone through the perspective-correction
   modal (components/scan) arrives as a plain Blob, not a File, and
   createImageBitmap works identically either way. */
export async function pngBlobFromImageFile(file: Blob, maxDim = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  removeNearWhiteBackground(ctx, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}
