'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { detectEdgesOffThread, preloadOpenCv } from '../../lib/shared/scanEdgeWorker';
import { warpToRect, averageEdgeSize, type Point } from '../../lib/shared/perspectiveWarp';
import styles from './ScanCaptureModal.module.css';

type Corner = 'nw' | 'ne' | 'se' | 'sw';
const CORNER_ORDER: Corner[] = ['nw', 'ne', 'se', 'sw'];

type Props = {
  /** 'camera' opens a live getUserMedia view with a real-time detected outline.
   *  'image' works from an already-picked file (From Gallery) instead. */
  mode: 'camera' | 'image';
  file?: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
};

/* Two phases: capture (camera mode only -- live video with OpenCV's
   detected quad drawn over it) and review (a still frame or the picked
   image, with the same 4 points now draggable by hand before the actual
   perspective warp runs). Detection seeds the starting corners; it never
   applies the warp by itself, so a bad detection is never silently
   trusted -- the user always sees and can correct the 4 points before
   confirming. */
export function ScanCaptureModal({ mode, file, onConfirm, onCancel }: Props) {
  const [phase, setPhase] = useState<'loading' | 'live' | 'review' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [corners, setCorners] = useState<Point[]>([]);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [confirming, setConfirming] = useState(false);
  const [liveDetected, setLiveDetected] = useState(false); // drives the "Looking for a document..." / "Document found" label

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null); // still frame / loaded image, drawn at natural size
  // frameWrapRef, not the outer flex-centering .display box, is what corner
  // percentages and drag math are measured against -- it's sized to hug the
  // canvas exactly (see .frameWrap), while .display can be considerably
  // bigger than a portrait photo inside a landscape viewport. Percentages
  // computed against the wrong (bigger) box would put corners in the wrong
  // place the moment the canvas doesn't fill the whole display area -- the
  // exact bug already fixed once in the annotate view for the same reason.
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null); // outer scroll/centering box, pointer events only
  const streamRef = useRef<MediaStream | null>(null);
  const detectLoopRef = useRef<number | null>(null);
  const liveCornersRef = useRef<Point[] | null>(null);
  const dragCornerRef = useRef<Corner | null>(null);
  const cancelledRef = useRef(false); // guards the async detection loop past unmount, separately from the effect's own `cancelled`

  useEffect(() => {
    let cancelled = false;

    // Kicked off before anything else, including the camera permission
    // prompt -- OpenCV's one-time load in the worker then runs in parallel
    // with the user granting permission and framing the shot, instead of
    // only starting once the live view is already up.
    preloadOpenCv();

    async function start() {
      try {
        if (mode === 'camera') {
          // `ideal`, not `exact` -- a hint the browser can fall back from
          // instead of an OverconstrainedError on a camera that can't hit
          // 4K. Without this, browsers commonly default the preview stream
          // to something like 640x480, which is what was making captures
          // look soft/low-res even before any JPEG compression.
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
          });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setPhase('live');
          // Detection (including OpenCV's own one-time load) runs entirely
          // in a Worker -- see lib/shared/scanEdgeWorker.ts -- so kicking it
          // off here can't delay or block the live camera view.
          runDetectionLoop();
        } else if (file) {
          const bitmap = await createImageBitmap(file);
          if (cancelled) { bitmap.close(); return; }
          const canvas = frameRef.current!;
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          setNaturalSize({ width: canvas.width, height: canvas.height });
          setCorners(defaultCorners(canvas.width, canvas.height));
          setPhase('review');

          // Same fallback logic as the camera path: detection only ever
          // improves the starting corners here, it's never required to
          // show the review step at all. `bitmap` is transferred to the
          // worker (already drawn above, so done with it on this side).
          detectEdgesOffThread(bitmap, canvas.width, canvas.height).then((detected) => {
            if (!cancelled && detected) setCorners(detected);
          });
        }
      } catch (err) {
        if (!cancelled) {
          // The actual message, not a canned one -- this is the one part of
          // the whole scan feature that can't be tested without a real
          // camera/browser, so surfacing what really failed (permission
          // denied, no camera, insecure context, etc.) matters more here
          // than a polished-sounding generic string.
          setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
          setPhase('error');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
      stopCamera();
      if (detectLoopRef.current) window.clearTimeout(detectLoopRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function defaultCorners(w: number, h: number): Point[] {
    const mx = w * 0.08;
    const my = h * 0.08;
    return [{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }];
  }

  // Runs roughly 4x/second, not every animation frame -- OpenCV's contour
  // pipeline on a full camera frame is real work, and the overlay only
  // needs to look "live", not track every single frame. The actual
  // detection happens in a Worker (scanEdgeWorker.ts); this loop only ever
  // does cheap main-thread work (grabbing a frame, waiting for the result),
  // so it can't be the thing that freezes the page the way running OpenCV
  // inline used to.
  async function runDetectionLoop() {
    if (cancelledRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      detectLoopRef.current = window.setTimeout(runDetectionLoop, 200);
      return;
    }
    const bitmap = await createImageBitmap(video);
    const corners = await detectEdgesOffThread(bitmap, video.videoWidth, video.videoHeight);
    if (cancelledRef.current) return;
    liveCornersRef.current = corners;
    forceOverlayRender();
    setLiveDetected(corners !== null);
    detectLoopRef.current = window.setTimeout(runDetectionLoop, 250);
  }

  // The live overlay is drawn straight onto a canvas each detection tick
  // rather than through React state -- at several times a second that's a
  // plain imperative redraw, not something that needs a re-render. Drawn
  // bold (translucent fill + corner dots, not just a thin stroke) so a
  // successful detection is unmistakable at a glance rather than a faint
  // line easy to miss against a real, busy background.
  function forceOverlayRender() {
    const video = videoRef.current;
    const overlay = document.getElementById('scan-overlay') as HTMLCanvasElement | null;
    if (!video || !overlay) return;
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const detected = liveCornersRef.current;
    if (!detected || video.videoWidth === 0) return;
    const sx = overlay.width / video.videoWidth;
    const sy = overlay.height / video.videoHeight;
    const points = detected.map((p) => ({ x: p.x * sx, y: p.y * sy }));

    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(74, 222, 128, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#4ADE80';
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Grabbing the live <video> frame (the old approach) captures whatever
  // the low-latency preview stream happens to look like at that instant --
  // soft, and often still mid-autofocus-hunt. `ImageCapture.takePhoto()`
  // asks the camera hardware for an actual still photo through its normal
  // photo pipeline (full resolution, settled focus/exposure), the same
  // capture path a native camera app uses. Falls back to the old
  // draw-the-video-frame approach on browsers without ImageCapture
  // (Firefox, Safari) -- capture still works there, just softer.
  async function handleCapture() {
    const video = videoRef.current;
    const canvas = frameRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !canvas) return;

    let photoBitmap: ImageBitmap | null = null;
    if (track && typeof ImageCapture !== 'undefined') {
      try {
        photoBitmap = await createImageBitmap(await new ImageCapture(track).takePhoto());
      } catch {
        photoBitmap = null; // Fall through to the video-frame capture below.
      }
    }

    const priorWidth = video.videoWidth;
    const priorHeight = video.videoHeight;
    if (photoBitmap) {
      canvas.width = photoBitmap.width;
      canvas.height = photoBitmap.height;
      canvas.getContext('2d')!.drawImage(photoBitmap, 0, 0);
      photoBitmap.close();
    } else {
      canvas.width = priorWidth;
      canvas.height = priorHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
    }

    setNaturalSize({ width: canvas.width, height: canvas.height });
    // The still photo is very often a different resolution than the live
    // preview the corners were detected against -- rescale so the outline
    // still lines up with the document instead of landing off to one side.
    const detected = liveCornersRef.current;
    const scaleX = priorWidth ? canvas.width / priorWidth : 1;
    const scaleY = priorHeight ? canvas.height / priorHeight : 1;
    setCorners(
      detected
        ? detected.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }))
        : defaultCorners(canvas.width, canvas.height)
    );
    stopCamera();
    if (detectLoopRef.current) window.clearTimeout(detectLoopRef.current);
    setPhase('review');
  }

  function pointFromEvent(e: ReactPointerEvent): Point {
    const rect = frameWrapRef.current!.getBoundingClientRect();
    const xPct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const yPct = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x: xPct * naturalSize.width, y: yPct * naturalSize.height };
  }

  function handleCornerDown(e: ReactPointerEvent, corner: Corner) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragCornerRef.current = corner;
  }

  function handleDisplayMove(e: ReactPointerEvent) {
    const corner = dragCornerRef.current;
    if (!corner) return;
    const index = CORNER_ORDER.indexOf(corner);
    const next = [...corners];
    next[index] = pointFromEvent(e);
    setCorners(next);
  }

  function handleDisplayUp() {
    dragCornerRef.current = null;
  }

  async function handleConfirm() {
    const canvas = frameRef.current;
    if (!canvas || corners.length !== 4) return;
    setConfirming(true);
    // warpToRect is a synchronous, pure-JS per-pixel remap -- on a large
    // photo that's real main-thread work (up to a couple of seconds on a
    // phone), and calling it in the very same tick as setConfirming(true)
    // never gave React a chance to actually paint "Processing..." first.
    // The screen looked frozen the whole time even though it wasn't --
    // this double rAF waits for a real paint before starting the work.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const { width, height } = averageEdgeSize(corners);
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const out = warpToRect(canvas, naturalSize.width, naturalSize.height, corners, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      // JPEG, not PNG: this is a photo, and PNG's lossless compression on
      // photographic content runs several times larger for no visible
      // benefit here -- that size difference is what was making the step
      // after "Use this" (uploading the result) feel so slow.
      out.toBlob((blob) => {
        setConfirming(false);
        if (blob) onConfirm(blob); else setErrorMessage('Could not process this image.');
      }, 'image/jpeg', 0.85);
    } catch {
      setConfirming(false);
      setErrorMessage('Could not process this image.');
    }
  }

  return (
    <div className={styles.scrim}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span>{mode === 'camera' ? 'Scan a document' : 'Adjust the corners'}</span>
          <button type="button" className={styles.close} onClick={() => { stopCamera(); onCancel(); }} aria-label="Cancel">×</button>
        </div>

        {phase === 'loading' && <p className={styles.status}>Loading…</p>}
        {phase === 'error' && (
          <div className={styles.status}>
            <p>{errorMessage}</p>
            <button type="button" className={styles.captureBtn} onClick={() => { stopCamera(); onCancel(); }}>
              Close
            </button>
          </div>
        )}

        {/* Always mounted, not just while phase === 'live' -- start() needs
            videoRef.current to already exist the moment the camera stream
            resolves (it assigns srcObject and calls play() before setPhase
            ever runs), so mounting the element only after phase flips to
            'live' left the ref null: srcObject was silently never set, the
            video element mounted empty, and the modal showed a black frame
            forever with no error (play() had already resolved on nothing,
            so no exception surfaced either). */}
        <div className={styles.videoWrap} hidden={phase !== 'live'}>
          <video ref={videoRef} className={styles.video} playsInline muted />
          {phase === 'live' && (
            <p className={liveDetected ? styles.detectHintFound : styles.detectHint}>
              {liveDetected ? 'Document found' : 'Looking for a document…'}
            </p>
          )}
          <canvas id="scan-overlay" className={styles.overlay} />
        </div>

        {/* Always mounted (used to hold the still frame / loaded image at
            native resolution for warpToRect), just visually hidden until
            the review phase actually needs to show it. */}
        <div
          ref={displayRef}
          className={styles.display}
          hidden={phase !== 'review'}
          onPointerMove={handleDisplayMove}
          onPointerUp={handleDisplayUp}
        >
          <div ref={frameWrapRef} className={styles.frameWrap}>
            <canvas ref={frameRef} className={styles.frame} />
            {phase === 'review' && corners.length === 4 && (
              <svg className={styles.quadSvg} viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`} preserveAspectRatio="none">
                <polygon
                  points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
                  fill="rgba(61,90,158,0.15)"
                  stroke="#3D5A9E"
                  strokeWidth={naturalSize.width * 0.004}
                />
              </svg>
            )}
            {phase === 'review' && corners.map((c, i) => (
              <div
                key={CORNER_ORDER[i]}
                className={styles.cornerHandle}
                style={{ left: `${(c.x / naturalSize.width) * 100}%`, top: `${(c.y / naturalSize.height) * 100}%` }}
                onPointerDown={(e) => handleCornerDown(e, CORNER_ORDER[i])}
              />
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          {phase === 'live' && (
            <button type="button" className={styles.captureBtn} onClick={handleCapture}>Capture</button>
          )}
          {phase === 'review' && (
            <button type="button" className={styles.captureBtn} onClick={handleConfirm} disabled={confirming}>
              {confirming ? 'Processing…' : 'Use this'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
