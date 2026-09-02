import { getContextOrNull } from '../../../../../lib/auth/dal';
import { getConversionJob } from '../../../../../lib/conversions/queries';
import { readFileBytes } from '../../../../../lib/files/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getContextOrNull();
  if (!context) return new Response(null, { status: 401 });

  const { id } = await params;
  const job = await getConversionJob(id, context.organization.id);
  if (!job || job.status !== 'done' || !job.resultFileId) return new Response(null, { status: 404 });

  const bytes = await readFileBytes(job.resultFileId, context.organization.id);

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="converted.pdf"',
    },
  });
}
