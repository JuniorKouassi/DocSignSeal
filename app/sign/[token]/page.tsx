import { getSigningView } from '../../../lib/signing/actions';
import { getFileMeta } from '../../../lib/files/store';
import SigningView from './SigningView';
import styles from './page.module.css';

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  malformed: { title: 'Link not valid', body: 'This signing link is malformed.' },
  not_found: { title: 'Link not valid', body: 'This signing link was not found. It may have been replaced by a newer one.' },
  expired: { title: 'This document has expired', body: 'The sender set an expiry date that has passed. Ask them to resend it.' },
  voided: { title: 'This document was voided', body: 'The sender cancelled this document before it was completed.' },
  declined: { title: 'This document was declined', body: 'This document was declined and can no longer be signed.' },
  already_signed: { title: 'Already signed', body: 'You have already signed this document.' },
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getSigningView(token);

  if (!view.ok) {
    const message = REASON_MESSAGES[view.reason] ?? { title: 'Link not valid', body: 'This signing link cannot be used.' };
    return (
      <div className={styles.page}>
        <div className={styles.notice}>
          <h1 className={styles.noticeTitle}>{message.title}</h1>
          <p className={styles.noticeBody}>{message.body}</p>
        </div>
      </div>
    );
  }

  const { document, signer, fields, editable, waitingFor } = view;
  const file = await getFileMeta(document.sourceFileId, document.organizationId);
  const pageCount = file?.pageCount ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>DocSignSeal</span>
        <span className={styles.title}>{document.title}</span>
      </header>
      <div className={styles.content}>
        {!editable && waitingFor && (
          <p className={styles.waitingBanner}>Waiting for {waitingFor} to sign first. You&rsquo;ll get an email when it&rsquo;s your turn.</p>
        )}
        <SigningView
          token={token}
          pageCount={pageCount}
          signerId={signer.id}
          editable={editable}
          fields={fields}
        />
      </div>
    </div>
  );
}
