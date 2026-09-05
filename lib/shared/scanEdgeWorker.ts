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

// Whether OpenCV ever actually finished loading in the worker, distinct
// from "loaded fine but this frame didn't match" -- lets the UI tell a
// genuine failure (worker/network/CSP blocked, or opencv.js itself erroring)
// apart from ordinary per-frame misses, which are normal and expected to
// happen constantly against a real handheld camera.
export type OpenCvStatus = 'loading' | 'ready' | 'failed';

// Diagnosed on a real device: OpenCV.js can get stuck compiling its
// embedded wasm binary indefinitely inside the worker, with no error, no
// abort, and critically no way for the worker's OWN setTimeout calls to
// intervene -- a stuck synchronous native call (like a huge
// WebAssembly.Module compile) blocks that entire single thread, and a
// timer can't preempt code running on the very thread it's scheduled on.
// The one thing that CAN interrupt that is this timer, running on the
// separate main thread: Worker.terminate() forcibly kills a worker even
// mid native-call, unconditionally. This is the last line of defense that
// guarantees the UI recovers no matter how badly the worker is stuck.
const WORKER_INIT_TIMEOUT_MS = 20000;

let worker: Worker | null = null;
let workerFailed = false;
let workerInitTimer: number | null = null;
let nextId = 0;
const pending = new Map<number, PendingEntry>();

let openCvStatus: OpenCvStatus = 'loading';
// Free-text sub-stage while status is 'loading' (e.g. "downloading 42%",
// "waiting for engine") -- exists purely so a stuck load can be diagnosed
// (which stage it's stuck at) instead of just staring at one static label
// for however long it takes to time out.
let openCvDetail = '';
const statusListeners = new Set<(status: OpenCvStatus, detail: string) => void>();

function setOpenCvStatus(status: OpenCvStatus, detail = '') {
  openCvStatus = status;
  openCvDetail = detail;
  statusListeners.forEach((cb) => cb(status, detail));
}

// Subscribes to OpenCV's load status; calls back immediately with the
// current value, then again on every change. Returns an unsubscribe fn.
export function onOpenCvStatus(cb: (status: OpenCvStatus, detail: string) => void): () => void {
  statusListeners.add(cb);
  cb(openCvStatus, openCvDetail);
  return () => statusListeners.delete(cb);
}

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(WORKER_URL);
  } catch {
    workerFailed = true;
    setOpenCvStatus('failed');
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; corners: Point[] | null } | { status: OpenCvStatus; error?: string; detail?: string }>) => {
    if ('status' in e.data) {
      if (e.data.status === 'ready' || e.data.status === 'failed') clearWorkerInitTimer();
      setOpenCvStatus(e.data.status, e.data.detail ?? e.data.error ?? '');
      return;
    }
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
    clearWorkerInitTimer();
    setOpenCvStatus('failed');
  };

  clearWorkerInitTimer();
  workerInitTimer = window.setTimeout(() => {
    workerInitTimer = null;
    // Give up on this worker for good rather than retrying (and stalling
    // for another 20s) on every future scan open -- a hang this deep is a
    // per-device/browser limitation, not a transient blip.
    worker?.terminate();
    worker = null;
    workerFailed = true;
    setOpenCvStatus('failed', 'timed out starting the scanning engine');
  }, WORKER_INIT_TIMEOUT_MS);

  return worker;
}

function clearWorkerInitTimer() {
  if (workerInitTimer !== null) {
    window.clearTimeout(workerInitTimer);
    workerInitTimer = null;
  }
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
