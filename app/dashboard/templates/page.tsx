import Link from 'next/link';
import { getCurrentContext } from '../../../lib/auth/dal';
import { listTemplates } from '../../../lib/templates/queries';
import styles from './page.module.css';

export default async function TemplatesPage() {
  const { organization } = await getCurrentContext();
  const items = await listTemplates(organization.id);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Templates</h1>
        <Link href="/dashboard/templates/new" className={styles.newLink}>Upload a PDF</Link>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>No templates yet. Upload a PDF to place fields on it.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/dashboard/templates/${t.id}`} className={styles.item}>
                <span className={styles.itemName}>{t.name}</span>
                <span className={styles.itemMeta}>{t.pageCount} page{t.pageCount === 1 ? '' : 's'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
