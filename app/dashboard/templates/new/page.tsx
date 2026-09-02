'use client';

import { useActionState, useState } from 'react';
import { uploadTemplate } from '../../../../lib/templates/actions';
import styles from './page.module.css';

let nextId = 2;

export default function NewTemplatePage() {
  const [state, action, pending] = useActionState(uploadTemplate, undefined);
  const [roles, setRoles] = useState([
    { id: 0, label: 'Signer 1' },
    { id: 1, label: 'Signer 2' },
  ]);

  function updateRole(id: number, label: string) {
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  function addRole() {
    setRoles((rs) => [...rs, { id: nextId++, label: `Signer ${rs.length + 1}` }]);
  }

  function removeRole(id: number) {
    setRoles((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Upload a template</h1>
      <form action={action}>
        <div className={styles.field}>
          <label htmlFor="name">Template name</label>
          <input id="name" name="name" type="text" placeholder="Consular authorization" />
          {state?.errors?.name && <p className={styles.error}>{state.errors.name}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="file">PDF file</label>
          <input id="file" name="file" type="file" accept="application/pdf" />
          {state?.errors?.file && <p className={styles.error}>{state.errors.file}</p>}
        </div>

        <div className={styles.field}>
          <label>Signer roles</label>
          {roles.map((r, i) => (
            <div className={styles.roleRow} key={r.id}>
              <input
                type="text"
                name="roleLabel"
                value={r.label}
                onChange={(e) => updateRole(r.id, e.target.value)}
                placeholder={`Signer ${i + 1}`}
              />
              <button
                type="button"
                className={styles.roleRemove}
                onClick={() => removeRole(r.id)}
                disabled={roles.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className={styles.addRole} onClick={addRole}>+ Add signer role</button>
          {state?.errors?.roleLabel && <p className={styles.error}>{state.errors.roleLabel}</p>}
        </div>

        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Uploading…' : 'Upload and continue'}
        </button>
      </form>
    </div>
  );
}
