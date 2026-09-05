'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { loadOpenCv, type OpenCvModule } from '../../lib/shared/loadOpenCv';
import { detectDocumentEdges } from '../../lib/shared/detectDocumentEdges';
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
  const cvRef = useRef<OpenCvModule | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectLoopRef = useRef<number | null>(null);
  const liveCornersRef = useRef<Point[] | null>(null);
  const dragCornerRef = useRef<Corner | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (mode === 'camera') {
          // Camera permission and the OpenCV.js download are independent --
          // starting both at once and awaiting only the camera means the
          // live preview appears as soon as the user grants permission,
          // instead of waiting on an 8MB library first. If OpenCV never
          // loads or fails, the camera view still works: handleCapture
          // falls back to a full-frame guess (defaultCorners) the user can
          // drag into place by hand, so a broken detection pipeline no
          // longer blocks the core "take a photo and crop it" path.
          const cvPromise = loadOpenCv();
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setPhase('live');
          cvPromise
            .then((cv) => {
              if (cancelled) return;
              cvRef.current = cv;
              runDetectionLoop();
            })
            .catch(() => {
              // Silent: no live-detection overlay, but capture still works.
            });
        } else if (file) {
          const bitmap = await createImageBitmap(file);
          if (cancelled) return;
          const canvas = frameRef.current!;
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          bitmap.close();
          setNaturalSize({ width: canvas.width, height: canvas.height });
          setCorners(defaultCorners(canvas.width, canvas.height));
          setPhase('review');

          // Same fallback logic as the camera path: OpenCV only ever
          // improves the starting corners here, it's never required to
          // show the review step at all.
          loadOpenCv()
            .then((cv) => {
              if (cancelled) return;
              const detected = detectDocumentEdges(cv, canvas);
              if (detected) setCorners(detected);
            })
            .catch(() => {
              // Silent: the full-frame guess set above stays as-is.
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
  // needs to look "live", not track every single frame.
  function runDetectionLoop() {
    const video = videoRef.current;
    const cv = cvRef.current;
    if (!video || !cv || video.readyState < 2) {
      detectLoopRef.current = window.setTimeout(runDetectionLoop, 200);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    liveCornersRef.current = detectDocumentEdges(cv, canvas);
    forceOverlayRender();
    detectLoopRef.current = window.setTimeout(runDetectionLoop, 250);
  }

  // The live overlay is drawn straight onto a canvas each detection tick
  // rather than through React state -- at several times a second that's a
  // plain imperative redraw, not something that needs a re-render.
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
    ctx.strokeStyle = '#3D5A9E';
    ctx.lineWidth = 3;
    ctx.beginPath();
    detected.forEach((p, i) => {
      const x = p.x * sx;
      const y = p.y * sy;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = frameRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    setNaturalSize({ width: canvas.width, height: canvas.height });
    setCorners(liveCornersRef.current ?? defaultCorners(canvas.width, canvas.height));
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
    try {
      const { width, height } = averageEdgeSize(corners);
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const out = warpToRect(canvas, naturalSize.width, naturalSize.height, corners, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      out.toBlob((blob) => {
        setConfirming(false);
        if (blob) onConfirm(blob); else setErrorMessage('Could not process this image.');
      }, 'image/png');
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

        {phase === 'live' && (
          <div className={styles.videoWrap}>
            <video ref={videoRef} className={styles.video} playsInline muted />
            <canvas id="scan-overlay" className={styles.overlay} />
          </div>
        )}

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
