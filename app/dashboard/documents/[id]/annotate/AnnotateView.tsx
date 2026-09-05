'use client';

import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applySignature, applyStamp, applyDate, removeAnnotation } from '../../../../../lib/documents/annotations';
import { completeSelfSignedDocument } from '../../../../../lib/documents/actions';
import { SignActionIcon, StampActionIcon, DateActionIcon, ExpandIcon, RotateIcon } from '../../../../../components/icons';
import styles from './AnnotateView.module.css';

type Signature = { id: string; isDefault: boolean };
type Stamp = { id: string; name: string };
type Placed = {
  id: string;
  type: 'signature' | 'stamp' | 'date';
  page: number;
  x: number; y: number; w: number; h: number;
  rotation: number;
  refId: string | null;
  valueText: string | null;
};

type Kind = 'signature' | 'stamp' | 'date';
type Pending = {
  kind: Kind;
  refId: string | null;
  label: string;
  x: number; y: number; w: number; h: number;
  rotation: number; // degrees, screen/CSS convention (clockwise-positive) while editing -- see confirmPlacement
};

const DEFAULT_SIZE: Record<Kind, { w: number; h: number }> = {
  signature: { w: 22, h: 10 },
  stamp: { w: 15, h: 15 },
  date: { w: 16, h: 6 },
};

export function AnnotateView({
  documentId,
  documentTitle,
  pageCount,
  signatures,
  stamps,
  placed: initialPlaced,
}: {
  documentId: string;
  documentTitle: string;
  pageCount: number;
  signatures: Signature[];
  stamps: Stamp[];
  placed: Placed[];
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [sheet, setSheet] = useState<'signature' | 'stamp' | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [appliedToAllPages, setAppliedToAllPages] = useState(false);
  const [placed, setPlaced] = useState(initialPlaced);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [placing, startPlacing] = useTransition();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | { mode: 'move'; startX: number; startY: number; box: Pending }
    | { mode: 'resize'; anchorX: number; anchorY: number }
    | { mode: 'rotate' }
    | null
  >(null);

  // initialPlaced is only the mount-time snapshot -- router.refresh() re-runs
  // the server component and hands this component a new `placed` prop, but
  // useState's initial value is ignored on every render after the first, so
  // without this effect a refresh would never actually reach the local copy
  // this component renders from. Not the "derive state from props" anti-
  // pattern the lint rule is guarding against -- `placed` is also mutated
  // locally (confirmPlacement's optimistic add, handleRemovePlaced's
  // optimistic filter) between refreshes, so it can't just be the prop
  // value used directly at render time.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaced(initialPlaced);
  }, [initialPlaced]);

  // Changing page without resetting scroll left the viewport wherever it was
  // scrolled to on the previous page, which on a page much shorter than the
  // last scroll position reads as "stuck"/broken.
  useEffect(() => {
    surfaceRef.current?.scrollTo({ top: 0 });
  }, [page]);

  // Every page render is a fresh round trip through the render-service
  // container (readFileBytes + a full re-parse of the source PDF, no
  // caching beyond the browser's own HTTP cache) -- there's no fixing that
  // from here, but prefetching the neighbours means the image is usually
  // already in the browser cache by the time Prev/Next is tapped, instead
  // of only starting the fetch then.
  useEffect(() => {
    const neighbours = [page - 1, page + 1].filter((p) => p >= 1 && p <= pageCount);
    const images = neighbours.map((p) => {
      const img = new Image();
      img.src = `/api/documents/${documentId}/pages/${p}`;
      return img;
    });
    return () => { images.forEach((img) => { img.src = ''; }); };
  }, [page, pageCount, documentId]);

  function openToolbar() {
    setToolbarOpen(true);
    setError(null);
  }

  function closeAll() {
    setToolbarOpen(false);
    setSheet(null);
    setPending(null);
    setAppliedToAllPages(false);
  }

  function choose(kind: Kind, refId: string | null, label: string) {
    const size = DEFAULT_SIZE[kind];
    setPending({ kind, refId, label, x: 50 - size.w / 2, y: 50 - size.h / 2, rotation: 0, ...size });
    setSheet(null);
  }

  function pointFromEvent(e: ReactPointerEvent) {
    // Against pageWrap, not surface: surface is the scrollable viewport
    // (flex-sized to whatever vertical space is available), which is
    // usually shorter than a tall page's actual rendered height. A mark's
    // x/y/w/h are percentages of the page image itself -- computing them
    // against the viewport's height instead placed a mark correctly while
    // dragging, then made it land somewhere else (often below the visible
    // page entirely) as soon as the page was taller than the viewport and
    // had to scroll.
    const rect = pageWrapRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  type Corner = 'nw' | 'ne' | 'sw' | 'se';

  function handleBoxPointerDown(e: ReactPointerEvent, target: 'move' | 'rotate' | Corner) {
    if (!pending) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);

    if (target === 'move') {
      const start = pointFromEvent(e);
      dragRef.current = { mode: 'move', startX: start.x, startY: start.y, box: pending };
      return;
    }

    if (target === 'rotate') {
      dragRef.current = { mode: 'rotate' };
      return;
    }

    // Resize is anchored to the corner opposite the one grabbed (e.g.
    // dragging the top-left handle keeps the bottom-right corner fixed),
    // computed once here rather than as a running delta -- that also means
    // dragging a handle past its anchor just flips the box instead of
    // going negative/breaking.
    const anchorX = target === 'nw' || target === 'sw' ? pending.x + pending.w : pending.x;
    const anchorY = target === 'nw' || target === 'ne' ? pending.y + pending.h : pending.y;
    dragRef.current = { mode: 'resize', anchorX, anchorY };
  }

  function handleSurfacePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || !pending) return;
    const p = pointFromEvent(e);

    if (drag.mode === 'move') {
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      // No edge clamp beyond keeping most of the box reachable -- a
      // signature in a corner or bleeding slightly off the page is a real
      // layout some documents need, not a mistake to prevent. flatten.mjs
      // just draws whatever x/y/w/h it's given; a mark that ends up mostly
      // off-page is a placement choice, not something that can crash it.
      setPending({
        ...pending,
        x: Math.min(100, Math.max(-drag.box.w + 5, drag.box.x + dx)),
        y: Math.min(100, Math.max(-drag.box.h + 5, drag.box.y + dy)),
      });
    } else if (drag.mode === 'resize') {
      setPending({
        ...pending,
        w: Math.max(3, Math.abs(p.x - drag.anchorX)),
        h: Math.max(3, Math.abs(p.y - drag.anchorY)),
        x: Math.min(p.x, drag.anchorX),
        y: Math.min(p.y, drag.anchorY),
      });
    } else {
      // Angle from the box's own center to the pointer, in pixels (not
      // percent -- pageWrap's width and height scale differently, so a
      // percent-space angle would be visually skewed unless the box happens
      // to be square). 0deg is straight up, increasing clockwise, which is
      // what dragging a handle around the box intuitively feels like.
      const rect = pageWrapRef.current!.getBoundingClientRect();
      const centerXpx = rect.left + ((pending.x + pending.w / 2) / 100) * rect.width;
      const centerYpx = rect.top + ((pending.y + pending.h / 2) / 100) * rect.height;
      const angle = Math.atan2(e.clientX - centerXpx, -(e.clientY - centerYpx)) * (180 / Math.PI);
      setPending({ ...pending, rotation: angle });
    }
  }

  function handleSurfacePointerUp() {
    dragRef.current = null;
  }

  function confirmPlacement() {
    if (!pending) return;
    setError(null);

    // pdf-lib's drawImage `rotate` turns out to be counterclockwise-positive
    // (the PDF/math convention -- PDF's y axis points up), while CSS
    // transform: rotate() is clockwise-positive (screen space, y points
    // down). pending.rotation is tracked in the CSS convention the whole
    // time it's being dragged (see handleSurfacePointerMove), so it's
    // negated only right here, once, going into the value flatten.mjs will
    // actually use -- everything rendered from *server* rotation values
    // (placedOnPage below) gets negated back for the same reason.
    const serverRotation = pending.kind === 'date' ? 0 : -pending.rotation;

    // Added to local state immediately on success, not left to wait for
    // router.refresh() to round-trip -- that's what was leaving the mark
    // invisible and the Save button disabled right after confirming. The
    // synced effect above will reconcile this temp-id row with the real one
    // once the refreshed props land; nothing reads its id in the meantime.
    const optimistic: Placed = {
      id: `pending-${Date.now()}`,
      type: pending.kind,
      page,
      x: pending.x, y: pending.y, w: pending.w, h: pending.h,
      rotation: serverRotation,
      refId: pending.refId,
      valueText: pending.kind === 'date' ? pending.label : null,
    };

    startPlacing(async () => {
      const opts = { w: pending.w, h: pending.h, appliedToAllPages, rotation: serverRotation };
      const result = pending.kind === 'signature'
        ? await applySignature(documentId, pending.refId!, page, pending.x, pending.y, opts)
        : pending.kind === 'stamp'
          ? await applyStamp(documentId, pending.refId!, page, pending.x, pending.y, opts)
          : await applyDate(documentId, page, pending.x, pending.y, opts);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlaced((p) => [...p, optimistic]);
      closeAll();
      router.refresh();
    });
  }

  function handleRemovePlaced(annotationId: string) {
    setPlaced((p) => p.filter((a) => a.id !== annotationId));
    startPlacing(async () => {
      await removeAnnotation(documentId, annotationId);
      router.refresh();
    });
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const result = await completeSelfSignedDocument(documentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/documents/${documentId}`);
    });
  }

  const placedOnPage = placed.filter((a) => a.page === page);
  // Any one of signature, stamp, or date is enough to save -- not
  // specifically a signature. Requiring a signature made it impossible to
  // save a document that only needed a stamp or a date, which are valid,
  // complete marks on their own.
  const hasMark = placed.length > 0;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <Link href="/dashboard/documents" className={styles.back} aria-label="Back">←</Link>
        <div className={styles.barTitle}>
          <b>{documentTitle}</b>
          <span>{page} of {pageCount}</span>
        </div>
        <button type="button" className={styles.save} onClick={handleSave} disabled={saving || !hasMark}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.pageNav}>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
        <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>›</button>
      </div>

      <div
        ref={surfaceRef}
        className={styles.surface}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleSurfacePointerUp}
      >
        <div ref={pageWrapRef} className={styles.pageWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static asset */}
          <img className={styles.pageImg} src={`/api/documents/${documentId}/pages/${page}`} alt={`Page ${page}`} />

          {placedOnPage.map((a) => (
            <div
              key={a.id}
              className={styles.mark}
              // a.rotation is in pdf-lib's counterclockwise-positive convention
              // (see confirmPlacement) -- negated back to CSS's clockwise-positive
              // so a placed mark's preview keeps matching the sealed PDF.
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%`, transform: `rotate(${-a.rotation}deg)` }}
            >
              {a.type === 'date' ? (
                <span className={styles.dateMark}>{a.valueText}</span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */
                <img
                  className={styles.markImg}
                  src={a.type === 'signature' ? `/api/signatures/${a.refId}/image` : `/api/stamps/${a.refId}/image`}
                  alt=""
                />
              )}
              <button type="button" className={styles.removeBtn} onClick={() => handleRemovePlaced(a.id)}>×</button>
            </div>
          ))}

          {pending && (
            <div
              className={styles.pendingBox}
              style={{
                left: `${pending.x}%`, top: `${pending.y}%`, width: `${pending.w}%`, height: `${pending.h}%`,
                transform: `rotate(${pending.rotation}deg)`,
              }}
              onPointerDown={(e) => handleBoxPointerDown(e, 'move')}
            >
              {pending.kind === 'date' ? (
                <span className={styles.dateMark}>{pending.label}</span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */
                <img
                  className={styles.markImg}
                  src={pending.kind === 'signature' ? `/api/signatures/${pending.refId}/image` : `/api/stamps/${pending.refId}/image`}
                  alt=""
                />
              )}
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <div
                  key={corner}
                  className={`${styles.resizeHandle} ${styles[`handle_${corner}`]}`}
                  onPointerDown={(e) => handleBoxPointerDown(e, corner)}
                >
                  {/* ExpandIcon is drawn along the nw-se diagonal; ne/sw reuse it
                      rotated a quarter turn rather than needing a second icon. */}
                  <ExpandIcon size={13} className={corner === 'ne' || corner === 'sw' ? styles.iconRotated : undefined} />
                </div>
              ))}
              {/* Date is plain text, drawn upright at a fixed size (flatten.mjs) --
                  rotating it wasn't asked for and its box has no real "face" to
                  turn, so only signature and stamp get a rotate handle. */}
              {pending.kind !== 'date' && (
                <div
                  className={styles.rotateHandle}
                  onPointerDown={(e) => handleBoxPointerDown(e, 'rotate')}
                >
                  <RotateIcon size={14} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className={styles.placeBar}>
          <button type="button" className={styles.insertAll} data-active={appliedToAllPages} onClick={() => setAppliedToAllPages((v) => !v)}>
            Insert on all pages
          </button>
          <div className={styles.placeActions}>
            <button type="button" className={styles.iconBtn} onClick={() => setPending(null)} aria-label="Discard">🗑</button>
            <button type="button" className={styles.confirmBtn} onClick={confirmPlacement} disabled={placing} aria-label="Confirm">✓</button>
          </div>
        </div>
      )}

      {sheet && (
        <div className={styles.sheetScrim} onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className={styles.sheet}>
            <p className={styles.sheetTitle}>{sheet === 'signature' ? 'Select a signature' : 'Select a stamp'}</p>
            <div className={styles.sheetGrid}>
              {sheet === 'signature' ? (
                <>
                  <Link href="/dashboard/signatures/new/draw" className={styles.sheetAdd}>+</Link>
                  {signatures.map((s) => (
                    <button key={s.id} type="button" className={styles.sheetTile} onClick={() => choose('signature', s.id, 'signature')}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */}
                      <img src={`/api/signatures/${s.id}/image`} alt="" />
                    </button>
                  ))}
                </>
              ) : (
                stamps.map((s) => (
                  <button key={s.id} type="button" className={styles.sheetTile} onClick={() => choose('stamp', s.id, s.name)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */}
                    <img src={`/api/stamps/${s.id}/image`} alt={s.name} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {toolbarOpen ? (
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolbarBtn} onClick={() => setSheet('signature')}>
            <SignActionIcon size={22} />
            <span>Sign</span>
          </button>
          {stamps.length > 0 && (
            <button type="button" className={styles.toolbarBtn} onClick={() => setSheet('stamp')}>
              <StampActionIcon size={22} />
              <span>Stamp</span>
            </button>
          )}
          <button type="button" className={styles.toolbarBtn} onClick={() => choose('date', null, new Date().toLocaleDateString())}>
            <DateActionIcon size={22} />
            <span>Date</span>
          </button>
        </div>
      ) : (
        !pending && (
          <button type="button" className={styles.signFab} onClick={openToolbar}>
            <SignActionIcon size={18} />
            Sign
          </button>
        )
      )}
    </div>
  );
}
