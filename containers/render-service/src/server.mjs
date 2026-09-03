import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { getPageCount, renderPageToPng } from './render.mjs';

/* Minimal HTTP wrapper around render.mjs, deliberately dependency-free
   (node:http, not Express) -- this container does exactly two things.
   Called from the main Next.js app over plain HTTPS (deployed on Render,
   not a Cloudflare-internal binding, so it's a public URL) -- see
   lib/render/client.ts there.

   RENDER_SERVICE_KEY gates /count and /render since this is now reachable
   from the public internet, not just a private service binding. /health
   stays open for Render's own health checks. */

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const SERVICE_KEY = process.env.RENDER_SERVICE_KEY;

function safeEqual(a, b) {
  const ba = Buffer.from(a ?? '');
  const bb = Buffer.from(b ?? '');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (!safeEqual(req.headers['x-render-service-key'], SERVICE_KEY)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
      return;
    }

    if (req.method === 'POST' && url.pathname === '/count') {
      const bytes = await readBody(req);
      const pageCount = await getPageCount(bytes);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pageCount }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/render') {
      const page = Number(url.searchParams.get('page'));
      const scale = url.searchParams.has('scale') ? Number(url.searchParams.get('scale')) : undefined;
      if (!Number.isInteger(page) || page < 1) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid page number');
        return;
      }
      const bytes = await readBody(req);
      const png = await renderPageToPng(bytes, page, scale);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Render failed: ' + (err?.message ?? String(err)));
  }
});

if (!SERVICE_KEY) {
  console.warn('RENDER_SERVICE_KEY is not set -- /count and /render will reject every request.');
}

server.listen(PORT, () => {
  console.log(`render-service listening on :${PORT}`);
});
