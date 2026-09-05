import type { OpenCvModule } from './loadOpenCv';
import type { Point } from './perspectiveWarp';

/* Grayscale -> blur -> Canny edges -> dilate -> find the largest
   roughly-4-sided contour that isn't a sliver. Standard "find the page in
   the photo" pipeline used by most OpenCV-based scanner tutorials. Returns
   null when nothing convincing is found (cluttered background, document
   fills the whole frame with no visible edge, poor lighting) -- callers
   fall back to a full-frame guess the user can drag into place by hand. */
export function detectDocumentEdges(cv: OpenCvModule, canvas: HTMLCanvasElement): Point[] | null {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const kernel = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.dilate(edges, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = canvas.width * canvas.height;
    let best: Point[] | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // Ignore slivers/noise -- a real document page should cover a
      // meaningful fraction of the frame, not a stray edge somewhere.
      if (area < imageArea * 0.15) {
        contour.delete();
        continue;
      }

      const approx = new cv.Mat();
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows === 4 && area > bestArea) {
        const points: Point[] = [];
        for (let p = 0; p < 4; p++) {
          points.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] });
        }
        best = orderCorners(points);
        bestArea = area;
      }

      approx.delete();
      contour.delete();
    }

    return best;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/* OpenCV hands back 4 points in whatever order it found them -- this pins
   them to [topLeft, topRight, bottomRight, bottomLeft], the order
   warpToRect (lib/shared/perspectiveWarp.ts) expects. Sum (x+y) is smallest
   at the top-left and largest at the bottom-right; the difference (y-x)
   is smallest at top-right and largest at bottom-left -- a standard,
   rotation-tolerant way to label 4 corners of a convex quad without
   knowing anything about the quad's actual orientation in advance. */
function orderCorners(points: Point[]): Point[] {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.y - p.x);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[diffs.indexOf(Math.min(...diffs))],
    points[sums.indexOf(Math.max(...sums))],
    points[diffs.indexOf(Math.max(...diffs))],
  ];
}
