import 'server-only';

/* Calls the render-service container over plain HTTPS -- it's deployed on
   Render (containers/render-service/), not a Cloudflare binding. That
   pivot happened because Cloudflare Containers currently has an unresolved
   platform bug (401 Unauthorized pushing container images even with
   correctly-scoped tokens -- see cloudflare/workers-sdk#12483, affecting
   many unrelated users, not fixable from this app's side). RENDER_SERVICE_KEY
   is a shared secret the container checks on every call, since it's now a
   public URL rather than a private service binding. */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function callContainer(path: string, bytes: Buffer): Promise<Response> {
  const base = requireEnv('RENDER_SERVICE_URL').replace(/\/$/, '');
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'X-Render-Service-Key': requireEnv('RENDER_SERVICE_KEY') },
    body: new Uint8Array(bytes),
  });
}

export async function getPageCount(bytes: Buffer): Promise<number> {
  const res = await callContainer('/count', bytes);
  if (!res.ok) throw new Error(`render-service /count failed: ${res.status}`);
  const { pageCount } = await res.json() as { pageCount: number };
  return pageCount;
}

export async function renderPageToPng(bytes: Buffer, page: number, scale?: number): Promise<Buffer> {
  const query = scale ? `?page=${page}&scale=${scale}` : `?page=${page}`;
  const res = await callContainer(`/render${query}`, bytes);
  if (!res.ok) throw new Error(`render-service /render failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
