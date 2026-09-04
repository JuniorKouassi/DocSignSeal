'use client';

import { useActionState } from 'react';
import { createSelfDocument } from '../../../../lib/documents/actions';
import styles from './page.module.css';

export default function UploadSignPage() {
  const [state, formAction, pending] = useActionState(createSelfDocument, undefined);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Upload - Sign - Stamp</h1>
      <p className={styles.hint}>
        No template, no other signers -- just this document and your own marks on it.
      </p>
      <form action={formAction}>
        <div className={styles.field}>
          <label htmlFor="title">Document title</label>
          <input id="title" name="title" type="text" placeholder="Lease agreement" />
          {state?.errors?.title && <p className={styles.error}>{state.errors.title}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="file">File</label>
          <input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,.pdf,.doc,.docx,.odt,.rtf"
          />
          {state?.errors?.file && <p className={styles.error}>{state.errors.file}</p>}
        </div>

        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Uploading…' : 'Continue to sign'}
        </button>
      </form>
    </div>
  );
}
