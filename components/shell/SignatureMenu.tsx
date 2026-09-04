'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '../i18n/useT';
import { useCreateSignatureFromFile } from '../signatures/useCreateSignatureFromFile';
import { DRAW_HREF, TYPE_HREF } from '../signatures/signatureCreateOptions';
import { DrawIcon, TypeIcon, GalleryIcon } from '../icons';
import styles from './SignatureMenu.module.css';

/* Desktop equivalent of SignatureFab: a header button that opens a dropdown
   instead of a floating speed dial. Only three entries -- Gallery and Scan
   collapse into one "Upload a photo" file picker here, since desktop has no
   camera-viewfinder affordance to give Scan its own entry. */
export function SignatureMenu() {
  const [open, setOpen] = useState(false);
  const t = useT();
  const { pick, pending, error } = useCreateSignatureFromFile();

  function close() {
    setOpen(false);
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.trigger} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('add_sig')}
      </button>

      {open && (
        <>
          <button type="button" className={styles.backdrop} aria-label="Close" onClick={close} />
          <div className={styles.menu} role="menu">
            {error && <p className={styles.error}>{t('sig_error')}</p>}
            <Link href={DRAW_HREF} className={styles.item} role="menuitem" onClick={close}>
              <DrawIcon size={17} />
              {t('draw')}
            </Link>
            <Link href={TYPE_HREF} className={styles.item} role="menuitem" onClick={close}>
              <TypeIcon size={17} />
              {t('type')}
            </Link>
            <button
              type="button"
              className={styles.item}
              role="menuitem"
              disabled={pending}
              onClick={() => { close(); pick(); }}
            >
              <GalleryIcon size={17} />
              {t('upload_photo')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
