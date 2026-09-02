import { getContextOrNull } from '../../../../../lib/auth/dal';
import { getDocument } from '../../../../../lib/documents/queries';
import { readFileBytes } from '../../../../../lib/files/store';
import { appendAuditEvent } from '../../../../../lib/audit/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getContextOrNull();
  if (!context) return new Response(null, { status: 401 });

  const { id } = await params;
  const document = await getDocument(id, context.organization.id);
  if (!document || !document.completedFileId) return new Response(null, { status: 404 });

  const bytes = await readFileBytes(document.completedFileId, context.organization.id);

  await appendAuditEvent({
    document_id: document.id,
    event: 'document.downloaded',
    actor: context.user.email,
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${document.title.replace(/[^\w.-]+/g, '_')}-signed.pdf"`,
    },
  });
}
