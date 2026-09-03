// Hand-written starting point. Once real Cloudflare resources exist, replace
// this by running `npm run cf-typegen` (wrangler generates it from the
// actual wrangler.jsonc + dashboard-configured secrets).
//
// No import here, so this file is a global script (not a module) and
// `interface CloudflareEnv` below merges directly with @opennextjs/
// cloudflare's own declaration of the same name -- no `declare global`
// wrapper needed as long as that stays true.
interface CloudflareEnv {
  // All read via process.env (OpenNext populates it from these as of this
  // wrangler.jsonc's compatibility_date) -- declared here only in case
  // anything ever reads them through getCloudflareContext().env directly.
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
  // Render-hosted services (see lib/render/client.ts, lib/gotenberg/client.ts,
  // .env.example) -- plain HTTPS, not Cloudflare bindings.
  RENDER_SERVICE_URL: string;
  RENDER_SERVICE_KEY: string;
  GOTENBERG_URL: string;
  GOTENBERG_USERNAME: string;
  GOTENBERG_PASSWORD: string;
}
