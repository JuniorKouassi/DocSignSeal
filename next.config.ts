import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

// Makes Cloudflare bindings (the render-service container, env vars, etc.)
// available when running `next dev` locally, not just after a real deploy.
// Must not run during `next build`: with Container bindings configured, it
// requires a build id that only exists inside a real deploy/dev session.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

export default nextConfig;
