'use client';

import { useActionState } from 'react';
import { createDocument } from '../../../../../lib/documents/actions';
import styles from './page.module.css';

export default function SendForm({
  templateId,
  templateName,
  signerRoles,
}: {
  templateId: string;
  templateName: string;
  signerRoles: { index: number; label: string }[];
}) {
  const action = createDocument.bind(null, templateId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Send &ldquo;{templateName}&rdquo; for signature</h1>
      <form action={formAction}>
        <div className={styles.field}>
          <label htmlFor="title">Document title</label>
          <input id="title" name="title" type="text" defaultValue={templateName} />
          {state?.errors?.title && <p className={styles.error}>{state.errors.title}</p>}
        </div>

        {signerRoles.map((role) => (
          <div className={styles.roleGroup} key={role.index}>
            <span className={styles.roleGroupLabel}>{role.label}</span>
            <div className={styles.field}>
              <label htmlFor={`signerName_${role.index}`}>Name</label>
              <input id={`signerName_${role.index}`} name={`signerName_${role.index}`} type="text" />
              {state?.errors?.[`signerName_${role.index}`] && (
                <p className={styles.error}>{state.errors[`signerName_${role.index}`]}</p>
              )}
            </div>
            <div className={styles.field}>
              <label htmlFor={`signerEmail_${role.index}`}>Email</label>
              <input id={`signerEmail_${role.index}`} name={`signerEmail_${role.index}`} type="email" />
              {state?.errors?.[`signerEmail_${role.index}`] && (
                <p className={styles.error}>{state.errors[`signerEmail_${role.index}`]}</p>
              )}
            </div>
          </div>
        ))}

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="routing">Signing order</label>
            <select id="routing" name="routing" defaultValue="sequential">
              <option value="sequential">One after another</option>
              <option value="parallel">Anyone, any order</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="expiresInDays">Expires after (days)</label>
            <input id="expiresInDays" name="expiresInDays" type="number" min={1} defaultValue={14} />
          </div>
        </div>

        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create document'}
        </button>
      </form>
    </div>
  );
}
