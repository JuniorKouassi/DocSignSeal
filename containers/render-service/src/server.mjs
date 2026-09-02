import { createServer } from 'node:http';
import { getPageCount, renderPageToPng } from './render.mjs';

/* Minimal HTTP wrapper around render.mjs, deliberately dependency-free
   (node:http, not Express) -- this container does exactly two things.
   Called from the main Next.js app (running on Cloudflare Workers) via a
   Durable Object container binding; see lib/render/client.ts there. */

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

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

server.listen(PORT, () => {
  console.log(`render-service listening on :${PORT}`);
});
