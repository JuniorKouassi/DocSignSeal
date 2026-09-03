'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '../i18n/useT';
import { DocsIcon, SignaturesIcon, StampsIcon, SettingsIcon } from '../icons';
import styles from './MobileTabBar.module.css';

const TABS = [
  { href: '/dashboard/documents', key: 't_docs', Icon: DocsIcon },
  { href: '/dashboard/signatures', key: 't_sigs', Icon: SignaturesIcon },
  { href: '/dashboard/stamps', key: 't_stamps', Icon: StampsIcon },
  { href: '/dashboard/settings', key: 't_set', Icon: SettingsIcon },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className={styles.tabs} aria-label={t('t_docs')}>
      {TABS.map(({ href, key, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={styles.tab} aria-pressed={active} data-active={active}>
            <span className={styles.iconWrap}>
              <Icon />
            </span>
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
