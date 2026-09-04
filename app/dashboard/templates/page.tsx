import Link from 'next/link';
import { getCurrentContext } from '../../../lib/auth/dal';
import { listCompletedDocuments } from '../../../lib/documents/queries';
import styles from './page.module.css';

/* Not a list of reusable field-layouts anymore -- a register of finished,
   sealed documents. A document moves here the moment it reaches
   'completed' (lib/documents/queries.ts's listCompletedDocuments); anything
   still active stays on the Documents tab, which is also where new
   documents get added (Upload & sign, or a multi-signer document via
   /dashboard/templates/new -- that upload+field-placement flow keeps its
   existing URL, it's just no longer reachable from a "browse templates"
   list, only from Documents' own header/FAB). */
export default async function TemplatesPage() {
  const { organization } = await getCurrentContext();
  const items = await listCompletedDocuments(organization.id);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Templates</h1>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>No completed documents yet. Finished, sealed documents will appear here.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((d) => (
            <li key={d.id}>
              <Link href={`/dashboard/documents/${d.id}`} className={styles.item}>
                <span className={styles.itemName}>{d.title}</span>
                <span className={styles.itemMeta}>
                  Completed {d.completedAt ? d.completedAt.toLocaleDateString() : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
