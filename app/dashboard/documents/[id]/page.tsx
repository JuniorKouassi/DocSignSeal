import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentContext } from '../../../../lib/auth/dal';
import { getDocument, getDocumentSigners, listAnnotations } from '../../../../lib/documents/queries';
import { getDocumentAuditEvents } from '../../../../lib/audit/store';
import { STATUS_GROUP, STATUS_LABELS } from '../../../../lib/documents/status';
import { listApplicableStamps } from '../../../../lib/stamps/queries';
import { getFileMeta } from '../../../../lib/files/store';
import SendButton from './SendButton';
import StampApplicator from './StampApplicator';
import styles from './page.module.css';

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, organization } = await getCurrentContext();
  const document = await getDocument(id, organization.id);
  if (!document) notFound();

  const [signers, events, applicableStamps, placedAnnotations, sourceFile] = await Promise.all([
    getDocumentSigners(document.id),
    getDocumentAuditEvents(document.id),
    listApplicableStamps(organization.id, user.id),
    listAnnotations(document.id),
    getFileMeta(document.sourceFileId, organization.id),
  ]);

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{document.title}</h1>
          <span className={`${styles.badge} ${styles[STATUS_GROUP[document.status]]}`}>
            {STATUS_LABELS[document.status]}
          </span>
        </div>
        {document.status === 'draft' && <SendButton documentId={document.id} />}
        {document.status === 'completed' && (
          <Link href={`/api/documents/${document.id}/download`} className={styles.sendButton}>Download sealed PDF</Link>
        )}
      </div>

      {document.status === 'completed' && document.seal && (
        <p className={styles.signerMeta} style={{ marginBottom: 'var(--dss-space-4)', wordBreak: 'break-all' }}>
          Seal: {document.seal}
        </p>
      )}

      {document.status !== 'completed' && applicableStamps.length > 0 && sourceFile?.pageCount && (
        <StampApplicator
          documentId={document.id}
          pageCount={sourceFile.pageCount}
          stamps={applicableStamps}
          placed={placedAnnotations.filter((a) => a.type === 'stamp')}
        />
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Signers</h2>
        {signers.map((s) => (
          <div className={styles.signerRow} key={s.id}>
            <div className={styles.signerInfo}>
              <span className={styles.signerName}>{s.name} · {s.roleLabel}</span>
              <span className={styles.signerMeta}>{s.email}</span>
            </div>
            <span className={styles.signerMeta}>{s.status}</span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Audit trail</h2>
        {events.length === 0 ? (
          <p className={styles.signerMeta}>No events yet.</p>
        ) : (
          events.map((e) => (
            <div className={styles.auditRow} key={String(e.id)}>
              <span className={styles.auditTime}>{new Date(e.created_at).toLocaleString()}</span>
              <span className={styles.auditEvent}>{e.event}</span>
              <span className={styles.auditActor}>{e.actor}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
