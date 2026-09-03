import { getT } from '../../../lib/i18n/server';
import styles from './page.module.css';

/* Stub for now -- the real signature-asset library (schema, queries,
   actions, typed/drawn/scanned signature creation) is a separate, larger
   pass. This just gives the new mobile tab bar a real destination to link
   to instead of a 404. */
export default async function SignaturesPage() {
  const t = await getT();

  return (
    <div>
      <h1 className={styles.title}>{t('sigs')}</h1>
      <p className={styles.empty}>{t('add_sig')} — {t('coming_soon')}</p>
    </div>
  );
}
