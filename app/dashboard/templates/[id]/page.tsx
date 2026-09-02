import { notFound } from 'next/navigation';
import { getCurrentContext } from '../../../../lib/auth/dal';
import { getTemplate, getTemplateFields } from '../../../../lib/templates/queries';
import FieldBuilder from './FieldBuilder';
import styles from './page.module.css';

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentContext();
  const template = await getTemplate(id, organization.id);
  if (!template) notFound();

  const existingFields = await getTemplateFields(template.id);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{template.name}</h1>
        <span className={styles.meta}>{template.pageCount} page{template.pageCount === 1 ? '' : 's'}</span>
      </div>

      <FieldBuilder
        templateId={template.id}
        pageCount={template.pageCount}
        signerRoles={template.signerRoles}
        initialFields={existingFields.map((f) => ({
          id: f.id,
          signerIndex: f.signerIndex,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          type: f.type,
          required: f.required,
          meta: f.meta,
        }))}
      />
    </div>
  );
}
