import 'server-only';
import { getContainer } from '@cloudflare/containers';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/* Gotenberg (see wrangler.jsonc's GotenbergContainer) is deliberately a
   "convert anything to PDF" tool, not a general converter: its API has no
   non-PDF output, by design. That covers Word/Excel/etc. -> PDF, which is
   what this calls. PDF -> Word and spreadsheet -> CSV are NOT built --
   Gotenberg can't do them at all, and standing up a second, differently
   configured LibreOffice service for two untested-demand directions wasn't
   worth it yet (confirmed with the user). */

function authHeader() {
  const user = process.env.GOTENBERG_USERNAME;
  const pass = process.env.GOTENBERG_PASSWORD;
  if (!user || !pass) throw new Error('GOTENBERG_USERNAME / GOTENBERG_PASSWORD are not set.');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

export async function convertOfficeDocumentToPdf(bytes: Buffer, filename: string): Promise<Buffer> {
  const { env } = getCloudflareContext();
  const container = getContainer(env.GOTENBERG_CONTAINER, 'default');

  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(bytes)]), filename);

  const res = await container.fetch('http://gotenberg/forms/libreoffice/convert', {
    method: 'POST',
    headers: { Authorization: authHeader() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Gotenberg conversion failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
