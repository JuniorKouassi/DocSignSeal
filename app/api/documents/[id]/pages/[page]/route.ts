import { getContextOrNull } from '../../../../../../lib/auth/dal';
import { getDocument } from '../../../../../../lib/documents/queries';
import { getFileMeta, readFileBytes } from '../../../../../../lib/files/store';
import { renderPageToPng } from '../../../../../../src/render.mjs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const context = await getContextOrNull();
  if (!context) return new Response(null, { status: 401 });

  const { id, page } = await params;
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return new Response('Invalid page number', { status: 400 });
  }

  const document = await getDocument(id, context.organization.id);
  if (!document) return new Response(null, { status: 404 });

  const file = await getFileMeta(document.sourceFileId, context.organization.id);
  if (!file || !file.pageCount || pageNumber > file.pageCount) {
    return new Response(null, { status: 404 });
  }

  const bytes = await readFileBytes(document.sourceFileId, context.organization.id);
  const png = await renderPageToPng(bytes, pageNumber);

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
