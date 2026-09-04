'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteSignature } from '../../lib/signatures/actions';
import styles from './SignatureCard.module.css';

export function SignatureCard({ id, isDefault, defaultLabel }: {
  id: string;
  isDefault: boolean;
  defaultLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);

  function handleDelete() {
    if (!window.confirm('Delete this signature? This cannot be undone.')) return;
    setHidden(true);
    startTransition(async () => {
      await deleteSignature(id);
      router.refresh();
    });
  }

  if (hidden) return null;

  return (
    <div className={styles.card}>
      {/* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */}
      <img className={styles.thumb} src={`/api/signatures/${id}/image`} alt="" />
      {isDefault && <span className={styles.badge}>{defaultLabel}</span>}
      <button
        type="button"
        className={styles.delete}
        onClick={handleDelete}
        disabled={pending}
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  );
}
