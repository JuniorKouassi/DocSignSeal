import Link from 'next/link';
import styles from './page.module.css';

export const metadata = { title: 'Terms and Conditions — DocSignSeal' };

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>← DocSignSeal</Link>
      <h1 className={styles.title}>Terms and Conditions</h1>
      <p className={styles.updated}>Last updated: September 2026</p>

      <div className={styles.article}>
        <p>
          These terms govern your use of DocSignSeal. By creating an account or using the service, you
          agree to them.
        </p>

        <h2>The service</h2>
        <p>
          DocSignSeal lets you upload documents, place signatures, initials, dates, and your
          organization&rsquo;s stamps on them, route them to signers, and produce a sealed record of
          completion with an audit trail. It is a tool for capturing and recording consent to sign — it
          does not provide legal advice about whether a particular document or signature method is valid
          for your purpose or jurisdiction.
        </p>

        <h2>Your account</h2>
        <p>
          You&rsquo;re responsible for the accuracy of the information you provide, for keeping your
          login credentials confidential, and for all activity that happens under your account. Tell us
          promptly if you suspect unauthorized access.
        </p>

        <h2>Your content</h2>
        <p>
          You retain ownership of the documents, signatures, and stamps you upload. You&rsquo;re
          responsible for having the right to upload and route that content, and for the truthfulness of
          any signer information you provide. We process your content only to operate the service for
          you, as described in our <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Organization stamps</h2>
        <p>
          If you administer an organization on DocSignSeal, you&rsquo;re responsible for who you grant
          permission to apply its stamps. Every application of a stamp is recorded against the document
          it was applied to and cannot be made anonymous.
        </p>

        <h2>Acceptable use</h2>
        <p>You agree not to use DocSignSeal to:</p>
        <ul>
          <li>Upload content you don&rsquo;t have the right to use or share;</li>
          <li>Impersonate another person or organization, or forge a signature or stamp;</li>
          <li>Attempt to disrupt, reverse-engineer, or gain unauthorized access to the service; or</li>
          <li>Use the service in a way that violates applicable law.</li>
        </ul>

        <h2>Availability and changes</h2>
        <p>
          We aim to keep the service available and reliable, but we don&rsquo;t guarantee uninterrupted
          access. We may change or discontinue features; where a change materially affects how you use
          the service, we&rsquo;ll make a reasonable effort to notify you first.
        </p>

        <h2>Disclaimer and limitation of liability</h2>
        <p>
          The service is provided &ldquo;as is,&rdquo; without warranties of any kind. To the maximum
          extent permitted by law, DocSignSeal is not liable for indirect, incidental, or consequential
          damages arising from your use of the service.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using the service and request deletion of your account at any time. We may
          suspend or terminate an account that violates these terms.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If we make a material change, we will update the date at the top of this page.
        </p>

        <h2>Contact</h2>
        <p>Questions about these terms: legal@docsignseal.com</p>
      </div>
    </div>
  );
}
