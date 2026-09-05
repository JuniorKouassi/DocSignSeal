/* Client-side only. Hands a video/image frame off to public/opencv-worker.js
   for edge detection instead of running OpenCV.js on the main thread.
   OpenCV.js's own one-time load/init is expensive enough on a phone CPU to
   freeze the page for several seconds -- that's what used to show up as the
   scan modal hanging on a black "Loading..." screen with Chrome's "page has
   become unresponsive" prompt. Moving the whole pipeline into a Worker means
   that cost (and every per-frame detection after it) can never block a
   paint or an input event on the main thread, however slow it is.

   Best-effort like the code it replaced: no Worker support, a failed
   opencv.js load, or a slow frame all resolve to `null` so callers fall
   back to the full-frame guess the user can drag into place by hand --
   auto-detection only ever improves the starting corners, never blocks
   showing them. */

import type { Point } from './perspectiveWarp';

const WORKER_URL = '/opencv-worker.js';

// A single frame taking longer than this to come back (worker still
// loading opencv.js, or just a slow device) means the overlay skips a beat
// instead of ever waiting on it indefinitely.
const REQUEST_TIMEOUT_MS = 4000;

type PendingEntry = { resolve: (points: Point[] | null) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
const pending = new Map<number, PendingEntry>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(WORKER_URL);
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; corners: Point[] | null }>) => {
    const { id, corners } = e.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.resolve(corners ?? null);
  };
  worker.onerror = () => {
    // An uncaught error inside the worker script itself (not a per-frame
    // failure, which the worker already catches and reports as a normal
    // message) -- resolve every in-flight request rather than hang them.
    pending.forEach((entry) => entry.resolve(null));
    pending.clear();
  };
  return worker;
}

// Starts OpenCV's one-time load in the worker immediately, without waiting
// for a frame to detect. Call this the instant the scan modal opens (before
// the camera permission prompt even resolves) so that multi-second load
// happens in parallel with the user granting permission and framing the
// shot, instead of only starting once the live view appears -- that's the
// difference between the auto-detect outline showing up almost immediately
// versus several seconds into looking at the camera.
export function preloadOpenCv(): void {
  getWorker()?.postMessage({ type: 'warm' });
}

export function detectEdgesOffThread(bitmap: ImageBitmap, width: number, height: number): Promise<Point[] | null> {
  const w = getWorker();
  if (!w) {
    bitmap.close();
    return Promise.resolve(null);
  }

  const id = nextId++;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, {
      resolve: (corners) => {
        window.clearTimeout(timer);
        resolve(corners);
      },
    });

    w.postMessage({ id, bitmap, width, height }, [bitmap]);
  });
}
