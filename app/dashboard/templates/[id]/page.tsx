import { notFound } from 'next/navigation';
import { getCurrentContext } from '../../../../lib/auth/dal';
import { getTemplate } from '../../../../lib/templates/queries';
import styles from './page.module.css';

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentContext();
  const template = await getTemplate(id, organization.id);
  if (!template) notFound();

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{template.name}</h1>
        <span className={styles.meta}>{template.pageCount} page{template.pageCount === 1 ? '' : 's'}</span>
      </div>

      <div className={styles.roles}>
        {template.signerRoles.map((role) => (
          <span key={role.index} className={styles.role}>{role.label}</span>
        ))}
      </div>

      <div className={styles.pages}>
        {Array.from({ length: template.pageCount }, (_, i) => i + 1).map((pageNumber) => (
          <div className={styles.pageWrap} key={pageNumber}>
            <p className={styles.pageLabel}>Page {pageNumber}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static asset */}
            <img src={`/api/templates/${template.id}/pages/${pageNumber}`} alt={`Page ${pageNumber} of ${template.name}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
