import 'server-only';
import { getRandom } from '@cloudflare/containers';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/* Calls the render-service container (containers/render-service/) over
   plain HTTP -- the container does the actual PDF-to-PNG rasterizing via
   @napi-rs/canvas, which cannot run inside this Worker's V8 isolate.
   getRandom spreads requests across wrangler.jsonc's configured
   max_instances rather than pinning every call to one container. */
async function callContainer(path: string, bytes: Buffer): Promise<Response> {
  const { env } = getCloudflareContext();
  const container = await getRandom(env.RENDER_CONTAINER, 2);
  return container.fetch(`http://render-service${path}`, {
    method: 'POST',
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
