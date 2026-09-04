import { getContextOrNull } from '../../../../../lib/auth/dal';
import { getSignature } from '../../../../../lib/signatures/queries';
import { readFileBytes } from '../../../../../lib/files/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getContextOrNull();
  if (!context) return new Response(null, { status: 401 });

  const { id } = await params;
  const signature = await getSignature(id, context.user.id);
  if (!signature) return new Response(null, { status: 404 });

  const bytes = await readFileBytes(signature.fileId, context.organization.id);

  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' },
  });
}
