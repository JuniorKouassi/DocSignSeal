import 'server-only';
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set. Copy .env.example to .env.local and fill it in.');
}
if (!process.env.EMAIL_FROM) {
  throw new Error('EMAIL_FROM is not set (e.g. "DocSignSeal <noreply@yourdomain.com>").');
}
if (!process.env.APP_URL) {
  throw new Error('APP_URL is not set (e.g. "https://app.docsignseal.com" or "http://localhost:3000").');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export function signingUrl(rawToken: string) {
  return `${process.env.APP_URL}/sign/${rawToken}`;
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
  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
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
