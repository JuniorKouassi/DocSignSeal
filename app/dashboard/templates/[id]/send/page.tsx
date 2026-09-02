import { notFound } from 'next/navigation';
import { getCurrentContext } from '../../../../../lib/auth/dal';
import { getTemplate } from '../../../../../lib/templates/queries';
import SendForm from './SendForm';

export default async function SendTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentContext();
  const template = await getTemplate(id, organization.id);
  if (!template) notFound();

  return <SendForm templateId={template.id} templateName={template.name} signerRoles={template.signerRoles} />;
}
