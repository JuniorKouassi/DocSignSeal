// Hand-written starting point. Once real Cloudflare resources exist, replace
// this by running `npm run cf-typegen` (wrangler generates it from the
// actual wrangler.jsonc + dashboard-configured secrets).
import type { RenderContainer } from "./custom-worker";

// This file has an import, making it a module -- interface CloudflareEnv
// must be wrapped in `declare global` here to merge with @opennextjs/
// cloudflare's own global CloudflareEnv declaration; without this block it
// would just be a module-local type nothing else can see.
declare global {
  interface CloudflareEnv {
    RENDER_CONTAINER: DurableObjectNamespace<RenderContainer>;

    // Secrets/vars -- also read via process.env elsewhere in the app
    // (OpenNext populates process.env from these as of this wrangler.jsonc's
    // compatibility_date), declared here only for anything read through
    // getCloudflareContext().env directly.
    DATABASE_URL: string;
    FILE_ENCRYPTION_MASTER_KEY: string;
    S3_BUCKET: string;
    S3_ACCESS_KEY_ID: string;
    S3_SECRET_ACCESS_KEY: string;
    S3_REGION: string;
    S3_ENDPOINT?: string;
    RESEND_API_KEY: string;
    EMAIL_FROM: string;
    APP_URL: string;
  }
}
