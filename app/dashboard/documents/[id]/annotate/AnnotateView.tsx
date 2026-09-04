'use client';

import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applySignature, applyStamp, applyDate, removeAnnotation } from '../../../../../lib/documents/annotations';
import { completeSelfSignedDocument } from '../../../../../lib/documents/actions';
import { SignActionIcon, StampActionIcon, DateActionIcon } from '../../../../../components/icons';
import styles from './AnnotateView.module.css';

type Signature = { id: string; isDefault: boolean };
type Stamp = { id: string; name: string };
type Placed = {
  id: string;
  type: 'signature' | 'stamp' | 'date';
  page: number;
  x: number; y: number; w: number; h: number;
  refId: string | null;
  valueText: string | null;
};

type Kind = 'signature' | 'stamp' | 'date';
type Pending = { kind: Kind; refId: string | null; label: string; x: number; y: number; w: number; h: number };

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
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; box: Pending } | null>(null);

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
    setPending({ kind, refId, label, x: 50 - size.w / 2, y: 50 - size.h / 2, ...size });
    setSheet(null);
  }

  function pointFromEvent(e: ReactPointerEvent) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function handleBoxPointerDown(e: ReactPointerEvent, mode: 'move' | 'resize') {
    if (!pending) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const start = pointFromEvent(e);
    dragRef.current = { mode, startX: start.x, startY: start.y, box: pending };
  }

  function handleSurfacePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || !pending) return;
    const p = pointFromEvent(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;

    if (drag.mode === 'move') {
      const w = drag.box.w;
      const h = drag.box.h;
      setPending({
        ...pending,
        x: Math.min(100 - w, Math.max(0, drag.box.x + dx)),
        y: Math.min(100 - h, Math.max(0, drag.box.y + dy)),
      });
    } else {
      setPending({
        ...pending,
        w: Math.min(80, Math.max(6, drag.box.w + dx)),
        h: Math.min(80, Math.max(4, drag.box.h + dy)),
      });
    }
  }

  function handleSurfacePointerUp() {
    dragRef.current = null;
  }

  function confirmPlacement() {
    if (!pending) return;
    setError(null);

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
      refId: pending.refId,
      valueText: pending.kind === 'date' ? pending.label : null,
    };

    startPlacing(async () => {
      const opts = { w: pending.w, h: pending.h, appliedToAllPages };
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
  const hasSignature = placed.some((a) => a.type === 'signature');

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <Link href="/dashboard/documents" className={styles.back} aria-label="Back">←</Link>
        <div className={styles.barTitle}>
          <b>{documentTitle}</b>
          <span>{page} of {pageCount}</span>
        </div>
        <button type="button" className={styles.save} onClick={handleSave} disabled={saving || !hasSignature}>
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
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static asset */}
        <img src={`/api/documents/${documentId}/pages/${page}`} alt={`Page ${page}`} />

        {placedOnPage.map((a) => (
          <div
            key={a.id}
            className={styles.mark}
            style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
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
            style={{ left: `${pending.x}%`, top: `${pending.y}%`, width: `${pending.w}%`, height: `${pending.h}%` }}
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
            <div
              className={styles.resizeHandle}
              onPointerDown={(e) => handleBoxPointerDown(e, 'resize')}
            />
          </div>
        )}
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
