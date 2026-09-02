import { getCurrentContext } from '../../lib/auth/dal';
import styles from './page.module.css';

export default async function DashboardPage() {
  const { user, organization } = await getCurrentContext();

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Welcome, {user.name}</h1>
      <p className={styles.body}>
        You are signed in to <strong>{organization.name}</strong>. Documents, signatures,
        stamps, and settings arrive in the next build steps — this confirms auth,
        organizations, and memberships are wired end to end.
      </p>
    </div>
  );
}
