/* Client-side only. Straightens a photo taken at an angle -- the actual
   "looks like a rescan" part, not just a crop. The user marks the
   document's 4 corners (no auto edge-detection: reliable corner-finding on
   an arbitrary background/lighting needs real computer vision, and a
   library for that is a much bigger dependency than this feature is worth;
   letting the user drag 4 points is what most scanner apps fall back to
   anyway when auto-detect isn't confident). Given those 4 points, this
   computes the projective transform that maps them onto a plain rectangle
   and resamples the photo through it, producing a flat, front-on image.

   This is the standard "4-point homography" used throughout document-
   scanning software -- solve an 8x8 linear system for the 8 coefficients of
     X = (a*x + b*y + c) / (g*x + h*y + 1)
     Y = (d*x + e*y + f) / (g*x + h*y + 1)
   from 4 point correspondences, then for every pixel in the OUTPUT
   rectangle, apply the transform to find where to sample it FROM in the
   source photo. Solving dest->src directly (rather than src->dest then
   inverting the matrix) means every output pixel gets a value with no
   gaps, and there's no separate matrix inversion step to get wrong. */

export type Point = { x: number; y: number };

function solve8x8(A: number[][], b: number[]): number[] {
  const n = 8;
  const m = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const div = m[col][col] || 1e-12;
    for (let c = col; c <= n; c++) m[col][c] /= div;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  return m.map((row) => row[n]);
}

function computeHomography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  return solve8x8(A, b);
}

function applyHomography(h: number[], x: number, y: number): Point {
  const [a, b, c, d, e, f, g, hh] = h;
  const denom = g * x + hh * y + 1;
  return { x: (a * x + b * y + c) / denom, y: (d * x + e * y + f) / denom };
}

/* corners must be [topLeft, topRight, bottomRight, bottomLeft] in the
   SOURCE image's own natural pixel coordinates. Returns a new canvas of
   exactly destWidth x destHeight holding the straightened result. */
export function warpToRect(source: CanvasImageSource, sourceW: number, sourceH: number, corners: Point[], destWidth: number, destHeight: number): HTMLCanvasElement {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceW;
  srcCanvas.height = sourceH;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(source, 0, 0, sourceW, sourceH);
  const srcData = srcCtx.getImageData(0, 0, sourceW, sourceH);

  const destCorners: Point[] = [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight },
  ];
  const homography = computeHomography(destCorners, corners); // dest -> src

  const out = document.createElement('canvas');
  out.width = destWidth;
  out.height = destHeight;
  const outCtx = out.getContext('2d')!;
  const outData = outCtx.createImageData(destWidth, destHeight);

  for (let dy = 0; dy < destHeight; dy++) {
    for (let dx = 0; dx < destWidth; dx++) {
      const { x: sx, y: sy } = applyHomography(homography, dx, dy);
      const sxi = Math.round(sx);
      const syi = Math.round(sy);
      const outIdx = (dy * destWidth + dx) * 4;
      if (sxi >= 0 && sxi < sourceW && syi >= 0 && syi < sourceH) {
        const srcIdx = (syi * sourceW + sxi) * 4;
        outData.data[outIdx] = srcData.data[srcIdx];
        outData.data[outIdx + 1] = srcData.data[srcIdx + 1];
        outData.data[outIdx + 2] = srcData.data[srcIdx + 2];
        outData.data[outIdx + 3] = srcData.data[srcIdx + 3];
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return out;
}

/* Straight-line distance between corners, used to pick a sensible output
   size that doesn't upscale past what the photo actually contains. */
export function averageEdgeSize(corners: Point[]): { width: number; height: number } {
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2;
  const height = (dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2;
  return { width, height };
}
