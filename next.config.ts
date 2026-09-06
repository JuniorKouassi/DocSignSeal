import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // The app never uses next/og or ImageResponse, but Next.js bundles
  // @vercel/og's wasm runtime (resvg.wasm + yoga.wasm, ~1.4 MB raw) into
  // every server function regardless. Wasm barely compresses, so it's a
  // disproportionate share of the gzipped Worker size -- exclude it so the
  // deploy fits under Cloudflare's free-plan 3 MiB compressed limit.
  outputFileTracingExcludes: {
    "*": ["./node_modules/next/dist/compiled/@vercel/og/**"],
  },
  experimental: {
    serverActions: {
      // Next.js defaults this to 1MB, which silently rejects the request
      // (a raw "Body exceeded 1 MB limit" crash, before any of this app's
      // own file-size validation ever runs) on any file bigger than that --
      // hit in practice on a PDF upload and on a photographed stamp once
      // converted to PNG. createSelfDocument/uploadTemplate/uploadStamp
      // already validate up to 25MB themselves (MAX_UPLOAD_BYTES /
      // MAX_BYTES); 30MB leaves headroom for multipart/form-data's own
      // boundary and field-metadata overhead on top of that.
      bodySizeLimit: "30mb",
    },
  },
};

// Makes Cloudflare bindings (env vars, R2, Images, etc.) available when
// running `next dev` locally, not just after a real deploy.
//
// Wrapped in .catch(): without `wrangler dev` context set up locally, this
// can still fail to fully emulate some bindings. Left unhandled, that would
// crash the whole dev server, not just the routes that need those bindings
// -- swallow it here so auth/database/everything else still works locally.
// render-service and Gotenberg are now plain HTTPS fetches to Render
// (lib/render/client.ts, lib/gotenberg/client.ts), so they work locally too
// as long as .env.local has real RENDER_*/GOTENBERG_* values.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev().catch((err: unknown) => {
    console.warn(
      "[cloudflare dev] Some Cloudflare bindings unavailable locally -- page-image rendering and conversions will fail until deployed.",
      err
    );
  });
}

export default nextConfig;
