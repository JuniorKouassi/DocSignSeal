import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.hero}>
      <span className={styles.mark}>DocSignSeal</span>
      <h1 className={styles.title}>Sign, stamp, and seal documents your institution controls</h1>
      <p className={styles.subtitle}>
        Route a document to its signers, apply your organization&rsquo;s official stamps under
        explicit permission, and get back a sealed PDF with a verifiable audit trail.
      </p>
      <div className={styles.actions}>
        <Link href="/signup" className={styles.primary}>Create an account</Link>
        <Link href="/login" className={styles.secondary}>Log in</Link>
      </div>
    </main>
  );
}
