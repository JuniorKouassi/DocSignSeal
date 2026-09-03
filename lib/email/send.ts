import 'server-only';
import { Resend } from 'resend';

/* Lazy: see lib/db/client.ts's comment for why. Next.js's build-time
   page-data collection imports every route module without calling any
   handler; validating these at module scope meant no route could build
   until Resend was configured, even ones that never send email. */

let client: Resend | null = null;

function getClient(): Resend {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set. Copy .env.example to .env.local and fill it in.');
  }
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example).`);
  return value;
}

export function signingUrl(rawToken: string) {
  return `${requireEnv('APP_URL')}/sign/${rawToken}`;
}

export async function sendSignerInvite(opts: {
  to: string;
  signerName: string;
  documentTitle: string;
  senderName: string;
  organizationName: string;
  rawToken: string;
}) {
  const url = signingUrl(opts.rawToken);
  await getClient().emails.send({
    from: requireEnv('EMAIL_FROM'),
    to: opts.to,
    subject: `${opts.senderName} sent you a document to sign: ${opts.documentTitle}`,
    text: [
      `Hello ${opts.signerName},`,
      '',
      `${opts.senderName} (${opts.organizationName}) has sent you "${opts.documentTitle}" to review and sign.`,
      '',
      url,
      '',
      'This link stays valid until the document is signed, declined, or expires.',
    ].join('\n'),
  });
}
