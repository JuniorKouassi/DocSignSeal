import Link from 'next/link';
import styles from './page.module.css';

export const metadata = { title: 'Privacy Policy — DocSignSeal' };

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>← DocSignSeal</Link>
      <h1 className={styles.title}>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: September 2026</p>

      <div className={styles.article}>
        <p>
          This policy explains what DocSignSeal collects when you use it to prepare, send, sign, stamp,
          and seal documents, why we collect it, and what you can do about it.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Account information</strong> — your name, email address, organization, and role.</li>
          <li>
            <strong>Documents and their contents</strong> — the files you upload, the fields and marks
            placed on them, and the signatures, initials, and organization stamps you create or apply.
          </li>
          <li>
            <strong>Signer information</strong> — when you send a document, the name, email, and (if you
            provide it) phone number of each person you route it to.
          </li>
          <li>
            <strong>Audit and activity data</strong> — timestamps, IP address, browser user agent, and a
            record of every action taken on a document (created, sent, viewed, signed, declined,
            completed). This is what makes a signed document verifiable, not incidental logging.
          </li>
          <li><strong>Preferences</strong> — your language setting.</li>
        </ul>

        <h2>How it&rsquo;s stored</h2>
        <p>
          Document files are encrypted at rest in object storage; account and document metadata, along
          with the audit trail, are kept in a managed Postgres database. The audit trail is append-only
          and hash-chained, so an alteration to any past entry is detectable.
        </p>

        <h2>Who else touches it</h2>
        <p>
          We use a small number of service providers to operate DocSignSeal, each processing data only
          to perform the specific task we ask of it:
        </p>
        <ul>
          <li>An email provider, to deliver signer invitations and notifications.</li>
          <li>
            A document-conversion service, to turn Word documents into PDF and to render page previews.
            Your file is sent to this service to perform the conversion and is not retained by it
            afterward.
          </li>
        </ul>
        <p>We do not sell your data, and we do not use your documents to train any model.</p>

        <h2>Stamps and permissions</h2>
        <p>
          An organization&rsquo;s stamps are a controlled asset: applying one to a document requires an
          explicit, individually granted permission, and every application is recorded in that
          document&rsquo;s audit trail with who applied it and when.
        </p>

        <h2>How long we keep it</h2>
        <p>
          We retain your account and document data for as long as your account is active, or as needed
          to satisfy legal, audit, or dispute-resolution obligations tied to a completed document. You
          can request deletion of your account and associated data at any time, subject to those
          obligations.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask us to access, correct, export, or delete the personal data we hold about you.
          Contact us using the details below and we will respond within a reasonable time.
        </p>

        <h2>Cookies</h2>
        <p>
          We use a session cookie to keep you signed in and a small cookie to remember your language
          choice. We do not use advertising or cross-site tracking cookies.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we make a material change to this policy, we will update the date at the top of this page.
        </p>

        <h2>Contact</h2>
        <p>Questions about this policy or your data: privacy@docsignseal.com</p>
      </div>
    </div>
  );
}
