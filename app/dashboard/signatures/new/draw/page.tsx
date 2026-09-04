'use client';

import { useActionState, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '../../../../../components/i18n/useT';
import { createSignature } from '../../../../../lib/signatures/actions';
import { CaptureHeader } from '../../../../../components/signatures/CaptureHeader';
import { InkColorRow } from '../../../../../components/signatures/InkColorRow';
import { DEFAULT_INK, inkHex, type InkColorKey } from '../../../../../components/signatures/inkColors';
import { PenIcon } from '../../../../../components/icons';
import styles from './page.module.css';

type Point = { x: number; y: number }; // percent of the pad, 0-100 -- resolution independent
type Stroke = Point[];

const MIN_WIDTH = 1.5;
const MAX_WIDTH = 6;
const DEFAULT_WIDTH = 3;

/* Canvas is never filled with a background colour, so everywhere no stroke
   passed stays transparent in the exported PNG -- that alone satisfies the
   spec's "transparent PNG" requirement, no extra compositing step needed.
   Points are stored as percent-of-pad, matching the app's existing
   percent-not-pixels convention (HANDOFF.md non-negotiable #1), so the same
   stroke_data replays correctly regardless of what size the pad was drawn
   at. */
export default function DrawSignaturePage() {
  const t = useT();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createSignature, undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [color, setColor] = useState<InkColorKey>(DEFAULT_INK);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    if (state && 'ok' in state) router.push('/dashboard/signatures');
  }, [state, router]);

  function redraw() {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !pad || !ctx) return;
    const rect = pad.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = inkHex(color);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      stroke.forEach((p, i) => {
        const x = (p.x / 100) * rect.width;
        const y = (p.y / 100) * rect.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  function resizeCanvas() {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !pad || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = pad.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(redraw, [color, width]);

  function pointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = padRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current = [...strokesRef.current, [pointFromEvent(e)]];
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    strokesRef.current[strokesRef.current.length - 1].push(pointFromEvent(e));
    redraw();
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasInk(strokesRef.current.some((s) => s.length > 1));
  }

  function handleClear() {
    strokesRef.current = [];
    setHasInk(false);
    redraw();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInk || !canvasRef.current || pending) return;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
    });

    const formData = new FormData();
    formData.set('kind', 'signature');
    formData.set('file', blob, 'signature.png');
    formData.set('strokeData', JSON.stringify(strokesRef.current));
    formAction(formData);
  }

  return (
    <form onSubmit={handleSubmit} className={styles.screen}>
      <CaptureHeader title={t('new_signature')} saveDisabled={!hasInk} pending={pending} />

      {state && 'errors' in state && state.errors && (
        <p className={styles.formError}>{Object.values(state.errors)[0]}</p>
      )}

      <div ref={padRef} className={styles.pad}>
        {!hasInk && <p className={styles.placeholder}>{t('draw_placeholder')}</p>}
        <div className={styles.baseline} />
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.widthRow}>
          <PenIcon size={13} />
          <input
            type="range"
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            step={0.5}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className={styles.widthSlider}
            aria-label="Stroke width"
          />
          <PenIcon size={22} />
        </div>
        <InkColorRow value={color} onChange={setColor} onClear={handleClear} />
      </div>
    </form>
  );
}
