'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadStamp } from '../../../lib/stamps/actions';
import { pngBlobFromImageFile } from '../../../lib/shared/imageToPng';
import { useScanCapture } from '../../../components/scan/useScanCapture';
import styles from './page.module.css';

export default function UploadStampForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { scanCamera, modal } = useScanCapture();
  // useActionState's own `pending` only covers the server action call --
  // the background-removal pass in handleSubmit runs before that and can
  // take a moment on a full-resolution photo, during which `pending` was
  // still false and the button silently sat at "Add stamp" with no
  // indication anything was happening (reported: upload "doesn't show...
  // it's actually not showing anything until the file just comes
  // suddenly"). This covers that earlier gap too.
  const [processing, setProcessing] = useState(false);
  const [state, action, pending] = useActionState(async (prevState: Awaited<ReturnType<typeof uploadStamp>>, formData: FormData) => {
    const result = await uploadStamp(prevState, formData);
    if (!result?.errors) router.refresh();
    return result;
  }, undefined);

  // Scan opens a live camera view with OpenCV.js detecting the stamp's
  // edges, then a drag-to-adjust step (components/scan) -- the result
  // writes into the same visible file input via DataTransfer rather than
  // tracking its own state, so handleSubmit below (background removal,
  // then uploadStamp) treats a scanned stamp exactly like one picked from
  // the file input directly.
  async function handleScan() {
    const blob = await scanCamera();
    if (!blob || !fileInputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'stamp.png', { type: blob.type }));
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

    setProcessing(true);
    if (file instanceof File && file.size > 0) {
      try {
        // A stamp renders at a small fraction of a page (STAMP_DEFAULT_SIZE
        // is 15% of page width/height) -- 1600px of source detail buys
        // nothing there but slower client-side processing and a bigger
        // upload. 700px is still sharp at that display size.
        const png = await pngBlobFromImageFile(file, 700);
        formData.set('file', png, 'stamp.png');
      } catch {
        // Fall through with the original file -- uploadStamp's own
        // "only PNG" validation will surface a clear error instead.
      }
    }

    action(formData);
    setProcessing(false);
  }

  return (
    <div className={styles.uploadCard}>
      {modal}
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
            {/* Mobile only (page.module.css) -- a live camera view is
                meaningless without a camera, and desktop's plain file picker
                above already covers "choose an existing image". */}
            <button type="button" className={styles.scanBtn} onClick={handleScan}>
              Scan
            </button>
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
        <button className={styles.submit} type="submit" disabled={pending || processing}>
          {pending || processing ? 'Uploading…' : 'Add stamp'}
        </button>
      </form>
    </div>
  );
}
