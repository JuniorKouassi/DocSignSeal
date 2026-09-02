'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveStamp, setStampPermission } from '../../../lib/stamps/actions';
import styles from './page.module.css';

type Member = { userId: string; name: string; email: string };

export default function StampCard({
  stampId,
  name,
  kind,
  members,
  grantedUserIds,
}: {
  stampId: string;
  name: string;
  kind: string;
  members: Member[];
  grantedUserIds: string[];
}) {
  const router = useRouter();
  const [granted, setGranted] = useState(new Set(grantedUserIds));
  const [, startTransition] = useTransition();
  const [archiving, setArchiving] = useState(false);

  function toggle(userId: string, checked: boolean) {
    setGranted((g) => {
      const next = new Set(g);
      if (checked) next.add(userId); else next.delete(userId);
      return next;
    });
    startTransition(async () => {
      await setStampPermission(stampId, userId, checked);
    });
  }

  function handleArchive() {
    if (!window.confirm(`Archive "${name}"? It stays on documents that already used it.`)) return;
    setArchiving(true);
    startTransition(async () => {
      await archiveStamp(stampId);
      router.refresh();
    });
  }

  return (
    <div className={styles.card}>
      {/* eslint-disable-next-line @next/next/no-img-element -- server-decrypted asset, not a static file */}
      <img className={styles.thumb} src={`/api/stamps/${stampId}/image`} alt={name} />
      <div className={styles.name}>{name}</div>
      <p className={styles.meta}>{kind}</p>
      {members.map((m) => (
        <label className={styles.permRow} key={m.userId}>
          <span>{m.name}</span>
          <input
            type="checkbox"
            checked={granted.has(m.userId)}
            onChange={(e) => toggle(m.userId, e.target.checked)}
          />
        </label>
      ))}
      <button type="button" className={styles.archiveBtn} onClick={handleArchive} disabled={archiving}>
        {archiving ? 'Archiving…' : 'Archive'}
      </button>
    </div>
  );
}
