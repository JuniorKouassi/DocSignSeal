'use client';

import { useActionState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadStamp } from '../../../lib/stamps/actions';
import { pngBlobFromImageFile } from '../../../lib/shared/imageToPng';
import styles from './page.module.css';

export default function UploadStampForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(async (prevState: Awaited<ReturnType<typeof uploadStamp>>, formData: FormData) => {
    const result = await uploadStamp(prevState, formData);
    if (!result?.errors) router.refresh();
    return result;
  }, undefined);

  // "Scan with camera" writes into the same visible file input via
  // DataTransfer rather than tracking its own state -- handleSubmit below
  // already reads whatever's in that input, so a physical stamp photographed
  // here goes through the exact same path (and the same background-removal
  // step) as one picked from the file input directly.
  function handleScanCaptured(e: React.ChangeEvent<HTMLInputElement>) {
    const captured = e.target.files?.[0];
    if (!captured || !fileInputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(captured);
    fileInputRef.current.files = dt.files;
  }

  // Native <form action> submission can't await an async canvas step before
  // building FormData, so this intercepts submit, normalises whatever image
  // was picked into a transparent PNG (lib/shared/imageToPng.ts -- same
  // near-white-background removal as gallery/scan signatures), swaps it
  // into the FormData in place of the raw file, and dispatches the action
  // manually. useActionState's `action` accepts a FormData payload directly
  // like this, not only via <form action=>.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file');

    if (file instanceof File && file.size > 0) {
      try {
        const png = await pngBlobFromImageFile(file);
        formData.set('file', png, 'stamp.png');
      } catch {
        // Fall through with the original file -- uploadStamp's own
        // "only PNG" validation will surface a clear error instead.
      }
    }

    action(formData);
  }

  return (
    <div className={styles.uploadCard}>
      <h2 className={styles.uploadTitle}>Add a stamp</h2>
      <form onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" placeholder="USDI-FC round seal" />
          {state?.errors?.name && <p className={styles.error}>{state.errors.name}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue="seal">
            <option value="seal">Seal</option>
            <option value="mention">Mention</option>
            <option value="header">Header</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="defaultInk">Default ink colour</label>
          <input id="defaultInk" name="defaultInk" type="color" defaultValue="#1B3FA8" />
        </div>
        <div className={styles.field}>
          <label htmlFor="file">Image</label>
          <div className={styles.fileRow}>
            <input id="file" name="file" type="file" accept="image/*" ref={fileInputRef} />
            {/* Mobile only (page.module.css) -- capture="environment" is
                meaningless without a camera, and desktop's plain file picker
                above already covers "choose an existing image". */}
            <button type="button" className={styles.scanBtn} onClick={() => scanInputRef.current?.click()}>
              Scan
            </button>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleScanCaptured}
            />
          </div>
          <span className={styles.hint}>Any background is removed automatically -- no need to pre-clean it.</span>
          {state?.errors?.file && <p className={styles.error}>{state.errors.file}</p>}
        </div>
        <div className={styles.field}>
          <label>
            <input type="checkbox" name="requiresCountersignature" />
            {' '}Requires a signature on the same page
          </label>
        </div>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Uploading…' : 'Add stamp'}
        </button>
      </form>
    </div>
  );
}
