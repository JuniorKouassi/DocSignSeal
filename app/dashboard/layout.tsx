import Link from 'next/link';
import { getCurrentContext } from '../../lib/auth/dal';
import { logout } from '../../lib/auth/actions';
import { getDict } from '../../lib/i18n/server';
import { I18nProvider } from '../../components/i18n/I18nProvider';
import { MobileTabBar } from '../../components/shell/MobileTabBar';
import styles from './layout.module.css';

/* Both shells render in every response -- CSS (@media, see layout.module.css)
   decides which is visible, not JS. A viewport-detected split has no
   knowledge of the real viewport during SSR, so it either guesses wrong and
   flashes on hydration or needs a loading state; CSS-only has neither
   problem and works before hydration/with JS disabled. Desktop (>=768px)
   keeps today's top nav completely unchanged; mobile (<768px) gets the new
   bottom tab bar instead, with org name/role/logout relocated to the new
   Settings tab (see app/dashboard/settings/page.tsx) since the tab bar has
   no room for them. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { membership, organization } = await getCurrentContext();
  const dict = await getDict();

  return (
    <I18nProvider dict={dict}>
      <div className={styles.shell}>
        <header className={`${styles.header} ${styles.desktopOnly}`}>
          <div className={styles.left}>
            <span className={styles.brand}>DocSignSeal</span>
            <nav className={styles.nav}>
              <Link href="/dashboard/documents">Documents</Link>
              <Link href="/dashboard/templates">Templates</Link>
              <Link href="/dashboard/stamps">Stamps</Link>
              <Link href="/dashboard/convert">Convert</Link>
            </nav>
          </div>
          <div className={styles.orgInfo}>
            <span className={styles.orgName}>{organization.name}</span>
            <span className={styles.roleBadge}>{membership.role}</span>
            <form action={logout} className={styles.logoutForm}>
              <button type="submit">Log out</button>
            </form>
          </div>
        </header>
        <main className={`${styles.content} ${styles.mobileContent}`}>{children}</main>
        <div className={styles.mobileOnly}>
          <MobileTabBar />
        </div>
      </div>
    </I18nProvider>
  );
}
