import Link from 'next/link';
import { getCurrentContext } from '../../../lib/auth/dal';
import { listDocuments } from '../../../lib/documents/queries';
import { STATUS_GROUP, STATUS_LABELS } from '../../../lib/documents/status';
import { DocumentsList } from './DocumentsList';
import { DocumentFab } from '../../../components/shell/DocumentFab';
import styles from './page.module.css';

export default async function DocumentsPage() {
  const { organization } = await getCurrentContext();
  const items = await listDocuments(organization.id);

  return (
    <div>
      {/* Desktop (>=768px): unchanged existing list. Mobile (<768px): new
          card list with filter chips, see page.module.css's @media block
          and DocumentsList.tsx. */}
      <div className={styles.desktopOnly}>
        <div className={styles.header}>
          <h1 className={styles.title}>Documents</h1>
          <Link href="/dashboard/templates" className={styles.newLink}>New from a template</Link>
        </div>

        {items.length === 0 ? (
          <p className={styles.empty}>No documents yet. Send a template to create one.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((d) => (
              <li key={d.id}>
                <Link href={`/dashboard/documents/${d.id}`} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemName}>{d.title}</span>
                    <span className={styles.itemMeta}>Created {d.createdAt.toLocaleDateString()}</span>
                  </div>
                  <span className={`${styles.badge} ${styles[STATUS_GROUP[d.status]]}`}>{STATUS_LABELS[d.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.mobileOnly}>
        <h1 className={styles.title}>Documents</h1>
        <DocumentsList items={items} />
        <DocumentFab />
      </div>
    </div>
  );
}
