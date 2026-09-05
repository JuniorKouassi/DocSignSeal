/* Client-side only. Lazily injects OpenCV.js (an ~8MB WASM build) the first
   time real document-edge detection is actually needed -- confirmed with
   the user given the size, deliberately not loaded on every page. Cached
   as a single promise so a second call (e.g. reopening the scan modal)
   reuses the already-loaded runtime instead of re-fetching or
   double-initializing it. */

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

// @latest rather than a pinned version: I can't verify from here which exact
// published version tag actually exists on npm/jsdelivr right now, and a
// wrong pin would just 404. If this ever needs pinning for reproducibility,
// check https://www.jsdelivr.com/package/npm/@techstark/opencv-js for the
// real current version first.
const OPENCV_SRC = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@latest/dist/opencv.js';

export function loadOpenCv(): Promise<OpenCvModule> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve(window.cv);
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_SRC;
    script.async = true;
    script.onerror = () => reject(new Error('Could not load the document-scanning library.'));
    script.onload = () => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error('Document-scanning library failed to initialize.'));
        return;
      }
      if (cv.Mat) {
        resolve(cv);
      } else {
        cv.onRuntimeInitialized = () => resolve(cv);
      }
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
