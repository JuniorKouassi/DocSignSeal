'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useT } from '../i18n/useT';
import { createSelfDocument } from '../../lib/documents/actions';
import styles from './DocumentFab.module.css';

/* Scoped to the Documents route only (see app/dashboard/documents/layout.tsx)
   rather than the shared dashboard shell, matching the mockup's FAB
   appearing only on its Documents screen. All four options are real:
   "Upload & sign" and "Multi-signer document" navigate to their own forms;
   "From Gallery" and "Scan" instead pick/capture a photo on the spot and
   submit it straight to createSelfDocument, which wraps it into a one-page
   PDF (lib/documents/actions.ts's wrapImageAsPdf) -- same destination
   (the annotate view) as any other upload, just no form screen in between.
   `capture` is the only difference between the two: it's what makes a
   mobile browser open the camera directly instead of a file/photo picker. */
export function DocumentFab() {
  const [open, setOpen] = useState(false);
  const t = useT();
  const [, formAction, pending] = useActionState(createSelfDocument, undefined);

  function pickPhoto(capture?: 'environment') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', capture);

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.set('title', `${capture ? 'Scan' : 'Photo'} ${new Date().toLocaleDateString()}`);
      formData.set('file', file);
      formAction(formData);
    };

    input.click();
    setOpen(false);
  }

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
          <button type="button" className={styles.speedButton} disabled={pending} onClick={() => pickPhoto()}>
            {t('from_gallery')}
          </button>
          <button type="button" className={styles.speedButton} disabled={pending} onClick={() => pickPhoto('environment')}>
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
