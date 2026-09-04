'use client';

import Link from 'next/link';
import { useT } from '../i18n/useT';
import styles from './CaptureHeader.module.css';

/* Shared header for every signature capture screen (draw, type -- gallery
   and scan have no screen of their own, see useCreateSignatureFromFile).
   Save is the form's own submit button, styled to sit in the header like
   the reference app, so useActionState's pending flag disables it exactly
   like any other submit control. */
export function CaptureHeader({ title, saveDisabled, pending }: {
  title: string;
  saveDisabled: boolean;
  pending: boolean;
}) {
  const t = useT();

  return (
    <div className={styles.bar}>
      <Link href="/dashboard/signatures" className={styles.back} aria-label="Back">
        ←
      </Link>
      <b className={styles.title}>{title}</b>
      <button type="submit" className={styles.save} disabled={saveDisabled || pending}>
        {t('save')}
      </button>
    </div>
  );
}
