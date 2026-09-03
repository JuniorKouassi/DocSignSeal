import { Container, getContainer, getRandom } from '@cloudflare/containers';

/* This worker exists only to host the two Containers behind a service
   binding the main app calls (see docsignseal's lib/render/client.ts and
   lib/gotenberg/client.ts) -- see wrangler.jsonc's comment for why these
   can't live directly in the main OpenNext app's own config. */

export class RenderContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '2m';
}

/* The official Gotenberg image, configured to require basic auth. Its
   username/password come from THIS worker's own secrets
   (`wrangler secret put GOTENBERG_USERNAME` / `GOTENBERG_PASSWORD`, run
   from containers/worker/) -- never hardcoded here or in wrangler.jsonc.
   The main app needs the same values as its own secrets too, to build the
   matching Authorization header it sends. */
export class GotenbergContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '5m';

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      API_ENABLE_BASIC_AUTH: 'true',
      GOTENBERG_API_BASIC_AUTH_USERNAME: env.GOTENBERG_USERNAME,
      GOTENBERG_API_BASIC_AUTH_PASSWORD: env.GOTENBERG_PASSWORD,
    };
  }
}

interface Env {
  RENDER_CONTAINER: DurableObjectNamespace<RenderContainer>;
  GOTENBERG_CONTAINER: DurableObjectNamespace<GotenbergContainer>;
  GOTENBERG_USERNAME: string;
  GOTENBERG_PASSWORD: string;
}

function forward(request: Request, stripPrefix: string): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice(stripPrefix.length) || '/';
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/render-service/')) {
      const container = await getRandom(env.RENDER_CONTAINER, 2);
      return container.fetch(forward(request, '/render-service'));
    }

    if (pathname.startsWith('/gotenberg/')) {
      const container = getContainer(env.GOTENBERG_CONTAINER, 'default');
      return container.fetch(forward(request, '/gotenberg'));
    }

    return new Response('Not found', { status: 404 });
  },
};
