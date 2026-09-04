'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '../i18n/useT';
import styles from './DocumentFab.module.css';

/* Scoped to the Documents route only (see app/dashboard/documents/layout.tsx)
   rather than the shared dashboard shell, matching the mockup's FAB
   appearing only on its Documents screen. "Upload & sign" and "Multi-signer
   document" are both real -- the former is createSelfDocument's freeform
   annotate flow, the latter the existing template-upload + field-builder
   flow (app/dashboard/templates/new), just no longer reached via a
   "Templates" label now that tab shows the completed-documents register
   instead. "From Gallery" and "Scan" have no backing implementation yet (no
   camera/photo picker plumbing exists) so they're visibly present but
   disabled, same scoping decision as the Signatures speed-dial. */
export function DocumentFab() {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <>
      {open && (
        <div className={styles.speed}>
          <Link href="/dashboard/documents/upload-sign" className={styles.speedButton} onClick={() => setOpen(false)}>
            {t('upload_sign')}
          </Link>
          <Link href="/dashboard/templates/new" className={styles.speedButton} onClick={() => setOpen(false)}>
            {t('multi_signer_doc')}
          </Link>
          <button type="button" className={styles.speedButton} disabled title={t('coming_soon')}>
            {t('from_gallery')}
          </button>
          <button type="button" className={styles.speedButton} disabled title={t('coming_soon')}>
            {t('scan')}
          </button>
        </div>
      )}
      <button
        type="button"
        className={styles.fab}
        aria-label={t('templates')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '+'}
      </button>
    </>
  );
}
