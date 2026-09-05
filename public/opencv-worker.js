/* Classic (non-module) Worker, loaded as a plain static asset -- not run
   through webpack/Turbopack, so it works identically under either bundler.
   Runs the same "load OpenCV.js, then find the document's edges" pipeline
   that used to run on the main thread (see lib/shared/loadOpenCv.ts and
   lib/shared/detectDocumentEdges.ts), but off it entirely.

   Why: OpenCV.js's own one-time setup (an ~8MB script whose embind layer
   wraps a huge C++ API surface in JS) is expensive enough on a phone CPU to
   freeze the page for several seconds -- the exact "page has become
   unresponsive" / stuck-on-black-"Loading..." bug this file exists to fix.
   Running it in a Worker means that cost, and every per-frame detection
   after it, lands on a background thread and can never block a paint or an
   input event on the main thread, no matter how slow it is. */

const OPENCV_SRC = 'https://docs.opencv.org/4.x/opencv.js';

let cvReady = null;

function loadCv() {
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    try {
      importScripts(OPENCV_SRC);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const cv = self.cv;
    if (!cv) {
      reject(new Error('opencv failed to attach to worker scope'));
      return;
    }
    if (cv.Mat) {
      resolve(cv);
      return;
    }
    cv.onRuntimeInitialized = () => resolve(cv);
  });
  // A failed load shouldn't be replayed forever on every future frame --
  // clear the cache so the next message tries importScripts again fresh.
  cvReady.catch(() => {
    cvReady = null;
  });
  return cvReady;
}

// Same pipeline as lib/shared/detectDocumentEdges.ts: grayscale -> blur ->
// Canny edges -> dilate -> largest roughly-4-sided contour that isn't a
// sliver. Kept in sync by hand since this file can't import that TS module.
function detectDocumentEdges(cv, imageData) {
  const src = cv.matFromImageData(imageData);
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

    const imageArea = imageData.width * imageData.height;
    let best = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < imageArea * 0.15) {
        contour.delete();
        continue;
      }

      const approx = new cv.Mat();
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows === 4 && area > bestArea) {
        const points = [];
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

function orderCorners(points) {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.y - p.x);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[diffs.indexOf(Math.min(...diffs))],
    points[sums.indexOf(Math.max(...sums))],
    points[diffs.indexOf(Math.max(...diffs))],
  ];
}

self.onmessage = async (e) => {
  const { id, bitmap, width, height, type } = e.data;

  // Fire-and-forget: lets the main thread kick off OpenCV's one-time load
  // as soon as the scan modal opens, well before the first real frame is
  // ready to detect (see scanEdgeWorker.ts's preloadOpenCv).
  if (type === 'warm') {
    loadCv().catch(() => {});
    return;
  }

  try {
    const cv = await loadCv();
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = ctx.getImageData(0, 0, width, height);
    const corners = detectDocumentEdges(cv, imageData);
    self.postMessage({ id, corners });
  } catch (err) {
    self.postMessage({ id, corners: null, error: err instanceof Error ? err.message : String(err) });
  }
};
