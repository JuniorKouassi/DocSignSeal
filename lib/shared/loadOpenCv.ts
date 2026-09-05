/* Client-side only. Lazily injects OpenCV.js (an ~8MB WASM build) the first
   time real document-edge detection is actually needed -- confirmed with
   the user given the size, deliberately not loaded on every page. Cached
   as a single promise so a second call (e.g. reopening the scan modal)
   reuses the already-loaded runtime instead of re-fetching or
   double-initializing it -- but only while it's still pending or already
   succeeded; a failed attempt clears the cache so the next open tries
   again from scratch instead of replaying the same failure forever. */

declare global {
  interface Window {
    cv: OpenCvModule;
  }
}

// Only the handful of members this app actually calls -- OpenCV.js's real
// surface is much larger and untyped upstream.
export type OpenCvModule = {
  onRuntimeInitialized?: () => void;
  Mat: new (...args: unknown[]) => OpenCvMat;
  MatVector: new () => { size(): number; get(i: number): OpenCvMat; delete(): void };
  Size: new (w: number, h: number) => unknown;
  imread(source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement): OpenCvMat;
  cvtColor(src: OpenCvMat, dst: OpenCvMat, code: number): void;
  GaussianBlur(src: OpenCvMat, dst: OpenCvMat, size: unknown, sigmaX: number): void;
  Canny(src: OpenCvMat, dst: OpenCvMat, t1: number, t2: number): void;
  dilate(src: OpenCvMat, dst: OpenCvMat, kernel: OpenCvMat): void;
  findContours(src: OpenCvMat, contours: unknown, hierarchy: OpenCvMat, mode: number, method: number): void;
  contourArea(contour: OpenCvMat): number;
  arcLength(contour: OpenCvMat, closed: boolean): number;
  approxPolyDP(contour: OpenCvMat, approx: OpenCvMat, epsilon: number, closed: boolean): void;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
};

export type OpenCvMat = {
  delete(): void;
  rows: number;
  cols: number;
  data32S: Int32Array;
};

let loadPromise: Promise<OpenCvModule> | null = null;

// The official OpenCV.org build, not the npm-packaged @techstark/opencv-js
// this used before -- that one is meant to be `import`ed by a bundler and
// apparently doesn't reliably attach `window.cv`/fire
// `onRuntimeInitialized` when just dropped in as a <script> tag, which is
// exactly this loader's whole approach. This is the same URL every OpenCV.js
// browser tutorial embeds for that reason. "4.x" is OpenCV.org's own
// evergreen alias for "latest 4.x build", not a version this app is pinning.
const OPENCV_SRC = 'https://docs.opencv.org/4.x/opencv.js';

// However it fails, it needs to fail within a bounded time -- otherwise a
// slow network or a broken build hangs the scan modal on "Loading..."
// forever with no way out except the modal's own close button.
const LOAD_TIMEOUT_MS = 20_000;

export function loadOpenCv(): Promise<OpenCvModule> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve(window.cv);
      return;
    }

    const timer = window.setTimeout(() => {
      reject(new Error('Timed out loading the document-scanning library.'));
    }, LOAD_TIMEOUT_MS);

    const script = document.createElement('script');
    script.src = OPENCV_SRC;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Could not load the document-scanning library.'));
    };
    script.onload = () => {
      const cv = window.cv;
      if (!cv) {
        window.clearTimeout(timer);
        reject(new Error('Document-scanning library failed to initialize.'));
        return;
      }
      if (cv.Mat) {
        window.clearTimeout(timer);
        resolve(cv);
      } else {
        cv.onRuntimeInitialized = () => {
          window.clearTimeout(timer);
          resolve(cv);
        };
      }
    };
    document.head.appendChild(script);
  });

  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
