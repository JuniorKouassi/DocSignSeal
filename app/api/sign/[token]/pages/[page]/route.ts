import { resolveSignerToken } from '../../../../../../lib/audit/store';
import { getFileMeta, readFileBytes } from '../../../../../../lib/files/store';
import { renderPageToPng } from '../../../../../../lib/render/client';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; page: string }> }
) {
  const { token, page } = await params;
  const resolution = await resolveSignerToken(token);
  if (!resolution.ok) return new Response(null, { status: 404 });

  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return new Response('Invalid page number', { status: 400 });
  }

  const { document } = resolution;
  const file = await getFileMeta(document.sourceFileId, document.organizationId);
  if (!file || !file.pageCount || pageNumber > file.pageCount) {
    return new Response(null, { status: 404 });
  }

  const bytes = await readFileBytes(document.sourceFileId, document.organizationId);
  const png = await renderPageToPng(bytes, pageNumber);

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
