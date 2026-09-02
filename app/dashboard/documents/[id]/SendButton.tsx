'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendDocument } from '../../../../lib/documents/actions';
import styles from './page.module.css';

export default function SendButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await sendDocument(documentId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div>
      <button type="button" className={styles.sendButton} onClick={handleClick} disabled={pending}>
        {pending ? 'Sending…' : 'Send for signature'}
      </button>
      {error && <p className={styles.sendError}>{error}</p>}
    </div>
  );
}
