'use client';

import { useActionState } from 'react';
import { convertWordToPdf } from '../../../lib/conversions/actions';
import styles from './page.module.css';

export default function ConvertForm() {
  const [state, action, pending] = useActionState(convertWordToPdf, undefined);

  return (
    <div className={styles.card}>
      <form action={action}>
        <div className={styles.field}>
          <label htmlFor="file">Word document (.doc, .docx, .odt, .rtf)</label>
          <input id="file" name="file" type="file" accept=".doc,.docx,.odt,.rtf" />
          {state?.errors?.file && <p className={styles.error}>{state.errors.file}</p>}
        </div>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Converting…' : 'Convert to PDF'}
        </button>
      </form>
      {state?.jobId && (
        <div className={styles.result}>
          <span>Converted.</span>
          <a href={`/api/conversions/${state.jobId}/download`}>Download PDF</a>
        </div>
      )}
    </div>
  );
}
