import { getContextOrNull } from '../../../../../lib/auth/dal';
import { getStamp } from '../../../../../lib/stamps/queries';
import { readFileBytes } from '../../../../../lib/files/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getContextOrNull();
  if (!context) return new Response(null, { status: 401 });

  const { id } = await params;
  const stamp = await getStamp(id, context.organization.id);
  if (!stamp) return new Response(null, { status: 404 });

  const bytes = await readFileBytes(stamp.fileId, context.organization.id);

  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' },
  });
}
