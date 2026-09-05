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

// Fetched through our own /api/opencv proxy (app/api/opencv/route.ts), not
// directly from docs.opencv.org: that origin sends no
// Access-Control-Allow-Origin header, so a cross-origin fetch() from here
// would be blocked outright by the browser before ever reaching the network
// -- fetch() enforces CORS even though importScripts() doesn't. Routing
// through our own origin (a plain server-side fetch there, unaffected by
// browser CORS) is what makes fetch() -- and therefore a real, enforceable
// AbortController timeout -- usable here at all. See that route for which
// upstream OpenCV.js version this proxies.
const OPENCV_BASE = 'https://docs.opencv.org/4.13.0/'; // locateFile fallback only; the wasm binary is inline, so this rarely if ever matters
const OPENCV_SRC = '/api/opencv';

// Bounded so a load that genuinely never settles reports as a clear failure
// instead of leaving the UI stuck on "Starting..." forever.
const FETCH_TIMEOUT_MS = 20000;
const INIT_TIMEOUT_MS = 15000;

let cvReady = null;

// Reports whether OpenCV ever actually finished loading, distinct from
// "loaded but this particular frame didn't match" -- without this the main
// thread has no way to tell a worker/CSP/network failure (permanently
// stuck) apart from ordinary per-frame detection misses (normal, expected
// to happen constantly on a real handheld camera).
function announceStatus(status, error) {
  self.postMessage({ status, error });
}

function loadCv() {
  if (cvReady) return cvReady;
  cvReady = fetchAndInitCv();
  cvReady.then(
    () => announceStatus('ready'),
    (err) => announceStatus('failed', err instanceof Error ? err.message : String(err))
  );
  // A failed load shouldn't be replayed forever on every future frame --
  // clear the cache so the next message tries fetching again fresh.
  cvReady.catch(() => {
    cvReady = null;
  });
  return cvReady;
}

async function fetchAndInitCv() {
  // importScripts() blocks the ENTIRE worker thread synchronously until the
  // fetch it does internally completes -- nothing else on this single
  // thread, including our own setTimeout safety nets, can run until it
  // returns. That's exactly why a "15s timeout" never actually fired even
  // after minutes stuck on "Starting document detector...": the timer was
  // powerless while importScripts was still blocked on a slow/stalled
  // mobile network download of this ~10MB file. Fetching it ourselves with
  // an AbortController gives an enforceable timeout that works no matter
  // how long or stuck the network request is.
  const controller = new AbortController();
  const fetchTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let scriptText;
  try {
    const res = await fetch(OPENCV_SRC, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    scriptText = await res.text();
  } catch (err) {
    throw new Error('Could not download the document-scanning library: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    clearTimeout(fetchTimer);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const initTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out initializing the document-scanning library.'));
    }, INIT_TIMEOUT_MS);

    function settleResolve(cv) {
      if (settled) return;
      settled = true;
      clearTimeout(initTimer);
      resolve(cv);
    }
    function settleReject(err) {
      if (settled) return;
      settled = true;
      clearTimeout(initTimer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }

    // This build embeds its wasm binary inline as a base64 data: URI in the
    // .js text itself -- locateFile is never even called, there's no
    // separate binary fetch to redirect, but it's harmless to leave wired.
    // onAbort matters more: instantiating a many-MB wasm module can abort
    // (e.g. a lower memory ceiling than the main thread gets on some mobile
    // browsers) without throwing anywhere catchable or ever calling
    // onRuntimeInitialized -- nothing was listening for that before.
    self.Module = {
      locateFile(path) {
        return path.endsWith('.wasm') ? OPENCV_BASE + path : path;
      },
      onAbort(what) {
        settleReject(new Error('OpenCV aborted: ' + what));
      },
      onRuntimeInitialized() {
        settleResolve(self.cv || self.Module);
      },
    };

    try {
      // Running the already-downloaded source directly (indirect eval, so it
      // executes in global scope like a real script would) instead of
      // importScripts(): the whole point here is to never again hand a
      // synchronous, unboundable network fetch to code we can't put a
      // timeout around.
      (0, eval)(scriptText);
    } catch (err) {
      settleReject(err);
      return;
    }
    const cv = self.cv;
    if (!cv) {
      settleReject(new Error('opencv failed to attach to worker scope'));
      return;
    }
    if (cv.Mat) {
      settleResolve(cv);
      return;
    }
    cv.onRuntimeInitialized = () => settleResolve(cv);
  });
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
