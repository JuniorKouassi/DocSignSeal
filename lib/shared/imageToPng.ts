/* Client-side only -- shared by lib/signatures/toPng.ts (gallery/scan
   signatures) and the stamp upload form: normalises any picked image into
   a plain PNG blob, with its near-white background stripped so the result
   pastes onto a document as just the ink/mark, not an opaque rectangle.
   Plain pixel math on a canvas, not a real background-removal model --
   works for the common case (a dark signature or stamp meaningfully darker
   than its own surrounding paper), not for a background that isn't lighter
   than the mark at all (e.g. colored paper close in tone to the ink). */

// How far below the sampled background brightness the gradient from
// "paper" to "untouched ink" spans -- kept as a fixed width, just anchored
// to a brightness this photo's own border actually has instead of assuming
// a fixed absolute white.
const GRADIENT_RANGE = 40;
// Safety margin above the sampled background level: real paper isn't
// perfectly flat, so treating pixels slightly darker than the sampled
// value (not just brighter-or-equal) as fully transparent avoids leaving
// a faint halo from ordinary paper-texture/anti-aliasing noise.
const TRANSPARENT_MARGIN = 8;
// A sampled "background" darker than this is almost certainly the ink
// itself (e.g. a stamp that fills nearly the whole frame with little
// border to sample) -- falling back to the old fixed assumption is safer
// than thresholding relative to what's actually the mark's own color.
const MIN_PLAUSIBLE_BACKGROUND = 150;

/* Real paper in a phone photo is rarely pure (255,255,255) -- indoor
   lighting casts a warm/cool tint and uneven exposure adds shade, so a
   fixed "brightness >= 235 is paper" cutoff leaves the background fully
   opaque whenever the actual paper in THIS photo is dimmer than that,
   however evenly lit and genuinely blank it looks to the eye. Sampling a
   border strip of the image itself (assumed to be background, not the
   mark, since a signature/stamp doesn't fill the whole frame it's
   photographed against) and thresholding relative to what "background"
   actually measures as in this specific photo adapts to that lighting
   instead of assuming a lighting condition it doesn't have. */
function estimateBackgroundBrightness(data: Uint8ClampedArray, width: number, height: number): number {
  const borderThickness = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const samples: number[] = [];

  function sample(x: number, y: number) {
    const i = (y * width + x) * 4;
    samples.push(Math.min(data[i], data[i + 1], data[i + 2]));
  }

  for (let x = 0; x < width; x += 2) {
    for (let d = 0; d < borderThickness; d++) {
      sample(x, d);
      sample(x, height - 1 - d);
    }
  }
  for (let y = borderThickness; y < height - borderThickness; y += 2) {
    for (let d = 0; d < borderThickness; d++) {
      sample(d, y);
      sample(width - 1 - d, y);
    }
  }

  samples.sort((a, b) => a - b);
  // The 80th percentile, not the median or max -- robust against a mark
  // that bleeds slightly into the sampled border, while still reflecting
  // the brightest (most paper-like) end of what the border actually is.
  return samples[Math.floor(samples.length * 0.8)];
}

function removeNearWhiteBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const backgroundBrightness = Math.max(MIN_PLAUSIBLE_BACKGROUND, estimateBackgroundBrightness(data, width, height));
  const fullyTransparentAt = backgroundBrightness - TRANSPARENT_MARGIN;
  const fullyOpaqueBelow = fullyTransparentAt - GRADIENT_RANGE;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.min(data[i], data[i + 1], data[i + 2]);
    if (brightness >= fullyTransparentAt) {
      data[i + 3] = 0;
    } else if (brightness > fullyOpaqueBelow) {
      const t = (brightness - fullyOpaqueBelow) / (fullyTransparentAt - fullyOpaqueBelow);
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
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
