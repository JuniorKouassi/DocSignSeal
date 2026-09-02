'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyStamp, removeAnnotation } from '../../../../lib/documents/annotations';
import styles from './StampApplicator.module.css';

type Stamp = { id: string; name: string };
type Placed = { id: string; page: number; x: number; y: number; w: number; h: number };

export default function StampApplicator({
  documentId,
  pageCount,
  stamps,
  placed,
}: {
  documentId: string;
  pageCount: number;
  stamps: Stamp[];
  placed: Placed[];
}) {
  const router = useRouter();
  const [stampId, setStampId] = useState(stamps[0]?.id ?? '');
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!stampId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setError(null);
    startTransition(async () => {
      const result = await applyStamp(documentId, stampId, page, x, y);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function handleRemove(annotationId: string, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await removeAnnotation(documentId, annotationId);
      router.refresh();
    });
  }

  if (stamps.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>Apply a stamp</h2>
      <div className={styles.controls}>
        <select value={stampId} onChange={(e) => setStampId(e.target.value)}>
          {stamps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label>
          Page{' '}
          <input
            type="number"
            min={1}
            max={pageCount}
            value={page}
            onChange={(e) => setPage(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))}
            style={{ width: 60 }}
          />
        </label>
        <span className={styles.hint}>Click the page to place it.</span>
      </div>

      <div className={styles.surface} onClick={handleClick}>
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static asset */}
        <img src={`/api/documents/${documentId}/pages/${page}`} alt={`Page ${page}`} />
        {placed.filter((p) => p.page === page).map((p) => (
          <div
            key={p.id}
            className={styles.mark}
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` }}
          >
            <button type="button" className={styles.removeBtn} onClick={(e) => handleRemove(p.id, e)} disabled={pending}>×</button>
          </div>
        ))}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
