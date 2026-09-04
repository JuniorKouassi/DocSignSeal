import 'server-only';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

/* Storage is S3-compatible on purpose: the same client works against
   Cloudflare R2 (set S3_ENDPOINT to the R2 account endpoint) or plain AWS S3
   (leave S3_ENDPOINT unset) by changing environment variables only, per
   HANDOFF.md ("Cloudflare R2 or S3, EU region"). Nothing in the app should
   import @aws-sdk/client-s3 directly outside this file.

   Client construction is lazy: Next.js's build-time page-data collection
   imports every route module without calling any handler. Constructing the
   S3Client eagerly at module scope meant no route could build until every
   S3_* var existed, even routes that never touch storage. */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
    /* @aws-sdk/client-s3's runtimeConfig.js resolves every one of these via
       `config?.x ?? loadNodeConfig(...)` when left unset -- and that
       fallback tries to read ~/.aws/config through Node's fs module, which
       Cloudflare Workers' Node compat shim doesn't implement
       ("[unenv] fs.readFile is not implemented yet!"), even though real
       credentials were supplied above. Pinning every one of them to a
       literal value (confirmed by reading node_modules/@aws-sdk/client-s3/
       dist-es/runtimeConfig.js directly) means none of them ever reach that
       fallback, regardless of which one the SDK happens to resolve first. */
    defaultsMode: 'legacy',
    retryMode: 'standard',
    maxAttempts: 3,
    useArnRegion: false,
    useDualstackEndpoint: false,
    useFipsEndpoint: false,
    disableS3ExpressSessionAuth: true,
    requestChecksumCalculation: 'WHEN_SUPPORTED',
    responseChecksumValidation: 'WHEN_SUPPORTED',
    authSchemePreference: [],
    sigv4aSigningRegionSet: [],
    userAgentAppId: '',
  });
  return client;
}

/* Keys are organization-scoped so a leaked key from one tenant's listing
   can't be guessed for another, and random rather than derived from the
   filename so re-uploads never collide or leak the original name. */
export function generateStorageKey(organizationId: string, extension: string) {
  return `org/${organizationId}/${randomUUID()}${extension ? `.${extension}` : ''}`;
}

export async function putObject(storageKey: string, body: Buffer, contentType: string) {
  await getClient().send(new PutObjectCommand({
    Bucket: requireEnv('S3_BUCKET'),
    Key: storageKey,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getObject(storageKey: string): Promise<Buffer> {
  const result = await getClient().send(new GetObjectCommand({ Bucket: requireEnv('S3_BUCKET'), Key: storageKey }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Object not found: ${storageKey}`);
  return Buffer.from(bytes);
}
