'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login } from '../../../lib/auth/actions';
import styles from '../form.module.css';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <>
      <h1 className={styles.title}>Log in</h1>
      {state?.message && <p className={styles.formError}>{state.message}</p>}
      <form action={action}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" />
        </div>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className={styles.switch}>
        No account yet? <Link href="/signup">Create one</Link>
      </p>
    </>
  );
}
