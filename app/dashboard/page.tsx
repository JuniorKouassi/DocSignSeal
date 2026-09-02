import Link from 'next/link';
import { getCurrentContext } from '../../lib/auth/dal';
import styles from './page.module.css';

export default async function DashboardPage() {
  const { user, organization } = await getCurrentContext();

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Welcome, {user.name}</h1>
      <p className={styles.body}>
        You are signed in to <strong>{organization.name}</strong>. Signatures, stamps,
        and settings arrive in later build steps —{' '}
        <Link href="/dashboard/templates">templates</Link> is the first one with real
        content: upload a PDF and see its pages rendered.
      </p>
    </div>
  );
}
