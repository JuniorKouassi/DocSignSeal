'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signup } from '../../../lib/auth/actions';
import styles from '../form.module.css';

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <>
      <h1 className={styles.title}>Create your account</h1>
      {state?.message && <p className={styles.formError}>{state.message}</p>}
      <form action={action}>
        <div className={styles.field}>
          <label htmlFor="organizationName">Organization</label>
          <input id="organizationName" name="organizationName" placeholder="Embassy of…" autoComplete="organization" />
          {state?.errors?.organizationName && <p className={styles.error}>{state.errors.organizationName}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" autoComplete="name" />
          {state?.errors?.name && <p className={styles.error}>{state.errors.name}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" />
          {state?.errors?.email && <p className={styles.error}>{state.errors.email}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" />
          {state?.errors?.password && <p className={styles.error}>{state.errors.password}</p>}
        </div>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className={styles.switch}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}
