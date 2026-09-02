import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

// Makes Cloudflare bindings (the render-service container, env vars, etc.)
// available when running `next dev` locally, not just after a real deploy.
// Must not run during `next build`: with Container bindings configured, it
// requires a build id that only exists inside a real deploy/dev session.
//
// Also wrapped in .catch(): local Container emulation needs Docker running:
// without it, this rejects with an unrelated-looking "Build ID should be
// set" assertion. Left unhandled, that crashes the whole dev server, not
// just the container-dependent routes -- swallow it here so auth/database/
// everything else still works locally; only calls that actually reach the
// render-service or Gotenberg containers (lib/render/client.ts,
// lib/gotenberg/client.ts) will fail until Docker is running or this is
// tested against a real deploy.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev().catch((err: unknown) => {
    console.warn(
      "[cloudflare dev] Container bindings unavailable locally (needs Docker running) -- page-image rendering and conversions will fail until deployed or Docker is started.",
      err
    );
  });
}

export default nextConfig;
