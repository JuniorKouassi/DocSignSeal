import Link from 'next/link';
import { getCurrentContext } from '../../../lib/auth/dal';
import { logout } from '../../../lib/auth/actions';
import { getLocale, getT } from '../../../lib/i18n/server';
import { supportedLocales } from '../../../lib/i18n/shared';
import { LanguageSheet } from '../../../components/shell/LanguageSheet';
import styles from './page.module.css';

export default async function SettingsPage() {
  const { membership, organization } = await getCurrentContext();
  const t = await getT();
  const locale = await getLocale();

  return (
    <div>
      <h1 className={styles.title}>{t('settings')}</h1>

      <div className={styles.orgHeader}>
        <span className={styles.orgName}>{organization.name}</span>
        <span className={styles.roleBadge}>{membership.role}</span>
      </div>

      <div className={styles.rowItem}>
        <span>{t('organisation')}</span>
        <span className={styles.value}>{organization.name} ›</span>
      </div>

      <div className={styles.rowItem} data-inert="true">
        <span>{t('members_permissions')}</span>
      </div>

      <LanguageSheet locales={supportedLocales()} currentLocale={locale} />

      <Link href="/dashboard/templates" className={styles.rowItem}>
        <span>{t('templates')}</span>
        <span className={styles.value}>›</span>
      </Link>

      <Link href="/dashboard/convert" className={styles.rowItem}>
        <span>{t('convert')}</span>
        <span className={styles.value}>›</span>
      </Link>

      <div className={styles.rowItem} data-inert="true">
        <span>{t('data_retention')}</span>
      </div>
      <div className={styles.rowItem} data-inert="true">
        <span>{t('storage_region')}</span>
      </div>
      <Link href="/privacy" target="_blank" className={styles.rowItem}>
        <span>{t('privacy_policy')}</span>
        <span className={styles.value}>›</span>
      </Link>
      <Link href="/terms" target="_blank" className={styles.rowItem}>
        <span>{t('terms')}</span>
        <span className={styles.value}>›</span>
      </Link>

      <form action={logout} className={styles.logoutForm}>
        <button type="submit" className={styles.logoutButton}>{t('log_out')}</button>
      </form>
    </div>
  );
}
