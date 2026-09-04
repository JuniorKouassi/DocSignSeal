'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '../i18n/useT';
import { useCreateSignatureFromFile } from '../signatures/useCreateSignatureFromFile';
import { DRAW_HREF, TYPE_HREF } from '../signatures/signatureCreateOptions';
import { DrawIcon, TypeIcon, GalleryIcon, ScanIcon } from '../icons';
import styles from './SignatureFab.module.css';

/* Mobile-only, scoped to the Signatures route. Tap "+" to reveal Draw / Type
   / From Gallery / Scan as a stacked speed dial, matching the reference
   app's mobile pattern. Desktop gets SignatureMenu instead, which merges
   Gallery and Scan into one "Upload a photo" entry -- see
   signatureCreateOptions.tsx and useCreateSignatureFromFile for why. */
export function SignatureFab() {
  const [open, setOpen] = useState(false);
  const t = useT();
  const { pick, pending, error } = useCreateSignatureFromFile();

  function close() {
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div className={styles.speed}>
          {error && <p className={styles.error}>{t('sig_error')}</p>}
          <Link href={DRAW_HREF} className={styles.speedButton} onClick={close}>
            <DrawIcon size={17} />
            {t('draw')}
          </Link>
          <Link href={TYPE_HREF} className={styles.speedButton} onClick={close}>
            <TypeIcon size={17} />
            {t('type')}
          </Link>
          <button
            type="button"
            className={styles.speedButton}
            disabled={pending}
            onClick={() => { close(); pick(); }}
          >
            <GalleryIcon size={17} />
            {t('from_gallery')}
          </button>
          <button
            type="button"
            className={styles.speedButton}
            disabled={pending}
            onClick={() => { close(); pick('environment'); }}
          >
            <ScanIcon size={17} />
            {t('scan')}
          </button>
        </div>
      )}
      <button
        type="button"
        className={styles.fab}
        aria-label={t('add_sig')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '+'}
      </button>
    </>
  );
}
