import { getCurrentContext } from '../../../lib/auth/dal';
import { listSignatures } from '../../../lib/signatures/queries';
import { getT } from '../../../lib/i18n/server';
import { SignatureFab } from '../../../components/shell/SignatureFab';
import { SignatureMenu } from '../../../components/shell/SignatureMenu';
import { SignatureCard } from '../../../components/signatures/SignatureCard';
import styles from './page.module.css';

export default async function SignaturesPage() {
  const { user } = await getCurrentContext();
  const t = await getT();
  const items = await listSignatures(user.id);

  return (
    <div>
      {/* Desktop (>=768px): header button + dropdown (SignatureMenu). Mobile
          (<768px): FAB + speed dial (SignatureFab). Same underlying list
          either way, see page.module.css's @media block. */}
      <div className={styles.desktopOnly}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('sigs')}</h1>
          <SignatureMenu />
        </div>
        <SignatureGrid items={items} empty={t('no_sigs')} defaultLabel={t('default')} />
      </div>

      <div className={styles.mobileOnly}>
        <h1 className={styles.title}>{t('sigs')}</h1>
        <SignatureGrid items={items} empty={t('no_sigs')} defaultLabel={t('default')} />
        <SignatureFab />
      </div>
    </div>
  );
}

function SignatureGrid({
  items,
  empty,
  defaultLabel,
}: {
  items: { id: string; isDefault: boolean }[];
  empty: string;
  defaultLabel: string;
}) {
  if (items.length === 0) return <p className={styles.empty}>{empty}</p>;

  return (
    <div className={styles.grid}>
      {items.map((s) => (
        <SignatureCard key={s.id} id={s.id} isDefault={s.isDefault} defaultLabel={defaultLabel} />
      ))}
    </div>
  );
}
