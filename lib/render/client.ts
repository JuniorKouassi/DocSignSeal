import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/* Calls the render-service container via the containers/worker/ service
   binding (CONTAINERS_WORKER) -- see wrangler.jsonc's comment for why the
   render-service container can't be bound directly in this app's own
   config. The URL host is a placeholder; only the path/method/body matter
   to a service binding's Fetcher. */
async function callContainer(path: string, bytes: Buffer): Promise<Response> {
  const { env } = getCloudflareContext();
  return env.CONTAINERS_WORKER.fetch(`https://containers-worker/render-service${path}`, {
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
