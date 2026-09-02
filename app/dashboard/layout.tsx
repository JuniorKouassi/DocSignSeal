import { getCurrentContext } from '../../lib/auth/dal';
import { logout } from '../../lib/auth/actions';
import styles from './layout.module.css';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { membership, organization } = await getCurrentContext();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>DocSignSeal</span>
        <div className={styles.orgInfo}>
          <span className={styles.orgName}>{organization.name}</span>
          <span className={styles.roleBadge}>{membership.role}</span>
          <form action={logout} className={styles.logoutForm}>
            <button type="submit">Log out</button>
          </form>
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
