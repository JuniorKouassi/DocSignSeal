import { getCurrentContext } from '../../../lib/auth/dal';
import { listConversionJobs } from '../../../lib/conversions/queries';
import ConvertForm from './ConvertForm';
import styles from './page.module.css';

export default async function ConvertPage() {
  const { organization } = await getCurrentContext();
  const jobs = await listConversionJobs(organization.id);

  return (
    <div>
      <h1 className={styles.title}>Convert to PDF</h1>
      <ConvertForm />

      {jobs.length === 0 ? (
        <p className={styles.empty}>No conversions yet.</p>
      ) : (
        <div className={styles.list}>
          {jobs.map((j) => (
            <div className={styles.row} key={j.id}>
              <span className={styles.rowMeta}>{j.createdAt.toLocaleString()}</span>
              <span className={`${styles.badge} ${styles[j.status]}`}>{j.status}</span>
              {j.status === 'done' && (
                <a href={`/api/conversions/${j.id}/download`}>Download</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
