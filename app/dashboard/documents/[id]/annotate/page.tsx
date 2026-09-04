import { notFound, redirect } from 'next/navigation';
import { getCurrentContext } from '../../../../../lib/auth/dal';
import { getDocument, getDocumentSigners, listAnnotations } from '../../../../../lib/documents/queries';
import { getFileMeta } from '../../../../../lib/files/store';
import { listSignatures } from '../../../../../lib/signatures/queries';
import { listApplicableStamps } from '../../../../../lib/stamps/queries';
import { AnnotateView } from './AnnotateView';

/* The "sign it ourselves" freeform flow: unlike /sign/[token] (pre-placed
   document_fields, external signer, token-gated), this is the uploader
   annotating their own document directly in the dashboard -- so it's an
   authenticated route guarded by session + signer-email match, not a
   token. See lib/documents/actions.ts's createSelfDocument and
   completeSelfSignedDocument. */
export default async function AnnotatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, organization } = await getCurrentContext();

  const document = await getDocument(id, organization.id);
  if (!document) notFound();
  if (document.status === 'completed') redirect(`/dashboard/documents/${id}`);

  const signers = await getDocumentSigners(id);
  const isSigner = signers.some((s) => s.email === user.email);
  if (!isSigner) redirect(`/dashboard/documents/${id}`);

  const [file, mySignatures, myStamps, existing] = await Promise.all([
    getFileMeta(document.sourceFileId, organization.id),
    listSignatures(user.id),
    listApplicableStamps(organization.id, user.id),
    listAnnotations(id),
  ]);

  return (
    <AnnotateView
      documentId={document.id}
      documentTitle={document.title}
      pageCount={file?.pageCount ?? 1}
      signatures={mySignatures.map((s) => ({ id: s.id, isDefault: s.isDefault }))}
      stamps={myStamps.map((s) => ({ id: s.id, name: s.name }))}
      placed={existing
        .filter((a) => a.type === 'signature' || a.type === 'stamp' || a.type === 'date')
        .map((a) => ({
          id: a.id,
          type: a.type as 'signature' | 'stamp' | 'date',
          page: a.page,
          x: a.x,
          y: a.y,
          w: a.w,
          h: a.h,
          refId: a.refId,
          valueText: a.valueText,
        }))}
    />
  );
}
