import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

// Makes Cloudflare bindings (env vars, the CONTAINERS_WORKER service
// binding, etc.) available when running `next dev` locally, not just after
// a real deploy.
//
// Wrapped in .catch(): without `wrangler dev`/Docker context set up
// locally, this can still fail to fully emulate some bindings. Left
// unhandled, that would crash the whole dev server, not just the routes
// that need those bindings -- swallow it here so auth/database/everything
// else still works locally; only calls that actually reach the
// render-service or Gotenberg containers (lib/render/client.ts,
// lib/gotenberg/client.ts, via the containers/worker/ service binding)
// will fail until this is tested against a real deploy.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev().catch((err: unknown) => {
    console.warn(
      "[cloudflare dev] Some Cloudflare bindings unavailable locally -- page-image rendering and conversions will fail until deployed.",
      err
    );
  });
}

export default nextConfig;
