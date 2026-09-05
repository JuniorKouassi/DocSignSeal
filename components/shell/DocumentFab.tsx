'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { useT } from '../i18n/useT';
import { createSelfDocument } from '../../lib/documents/actions';
import { useScanCapture } from '../scan/useScanCapture';
import styles from './DocumentFab.module.css';

/* Scoped to the Documents route only (see app/dashboard/documents/layout.tsx)
   rather than the shared dashboard shell, matching the mockup's FAB
   appearing only on its Documents screen. All four options are real:
   "Upload & sign" and "Multi-signer document" navigate to their own forms;
   "From Gallery" picks an existing photo and submits it straight to
   createSelfDocument, which wraps it into a one-page PDF
   (lib/documents/actions.ts's wrapImageAsPdf). "Scan" instead opens a live
   camera view (components/scan) with OpenCV.js detecting the document's
   edges in real time, then a drag-to-adjust step, before the same
   wrapImageAsPdf destination -- an existing photo from the gallery is
   usually already framed; a fresh camera shot usually isn't, which is the
   actual reason these two use different capture paths. */
export function DocumentFab() {
  const [open, setOpen] = useState(false);
  const t = useT();
  const [, formAction, pending] = useActionState(createSelfDocument, undefined);
  const { scanCamera, modal } = useScanCapture();

  function submit(file: Blob, label: string) {
    const formData = new FormData();
    formData.set('title', `${label} ${new Date().toLocaleDateString()}`);
    formData.set('file', file, 'photo.png');
    formAction(formData);
  }

  function pickGallery() {
    setOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) submit(file, 'Photo');
    };
    input.click();
  }

  async function handleScan() {
    setOpen(false);
    const blob = await scanCamera();
    if (blob) submit(blob, 'Scan');
  }

  return (
    <>
      {modal}
      {open && (
        <div className={styles.speed}>
          <Link href="/dashboard/documents/upload-sign" className={styles.speedButton} onClick={() => setOpen(false)}>
            {t('upload_sign')}
          </Link>
          <Link href="/dashboard/templates/new" className={styles.speedButton} onClick={() => setOpen(false)}>
            {t('multi_signer_doc')}
          </Link>
          <button type="button" className={styles.speedButton} disabled={pending} onClick={pickGallery}>
            {t('from_gallery')}
          </button>
          <button type="button" className={styles.speedButton} disabled={pending} onClick={handleScan}>
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
