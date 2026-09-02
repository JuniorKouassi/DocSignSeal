'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadStamp } from '../../../lib/stamps/actions';
import styles from './page.module.css';

export default function UploadStampForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prevState: Awaited<ReturnType<typeof uploadStamp>>, formData: FormData) => {
    const result = await uploadStamp(prevState, formData);
    if (!result?.errors) router.refresh();
    return result;
  }, undefined);

  return (
    <div className={styles.uploadCard}>
      <h2 className={styles.uploadTitle}>Add a stamp</h2>
      <form action={action}>
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
          <label htmlFor="file">Transparent PNG</label>
          <input id="file" name="file" type="file" accept="image/png" />
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
