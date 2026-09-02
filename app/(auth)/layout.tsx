import Link from 'next/link';
import styles from './layout.module.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Link href="/" className={styles.mark}>DocSignSeal</Link>
        {children}
      </div>
    </div>
  );
}
