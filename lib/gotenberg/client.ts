import 'server-only';

/* Gotenberg is deliberately a "convert anything to PDF" tool, not a general
   converter: its API has no non-PDF output, by design. That covers
   Word/Excel/etc. -> PDF, which is what this calls. PDF -> Word and
   spreadsheet -> CSV are NOT built -- Gotenberg can't do them at all, and
   standing up a second, differently configured LibreOffice service for
   two untested-demand directions wasn't worth it yet (confirmed with the
   user).

   Deployed on Render (a prebuilt gotenberg/gotenberg image), reached over
   plain HTTPS -- not a Cloudflare binding, after Cloudflare Containers hit
   an unresolved platform bug pushing container images
   (cloudflare/workers-sdk#12483). */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function authHeader() {
  const user = requireEnv('GOTENBERG_USERNAME');
  const pass = requireEnv('GOTENBERG_PASSWORD');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

export async function convertOfficeDocumentToPdf(bytes: Buffer, filename: string): Promise<Buffer> {
  const base = requireEnv('GOTENBERG_URL').replace(/\/$/, '');

  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(bytes)]), filename);

  const res = await fetch(`${base}/forms/libreoffice/convert`, {
    method: 'POST',
    headers: { Authorization: authHeader() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Gotenberg conversion failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
