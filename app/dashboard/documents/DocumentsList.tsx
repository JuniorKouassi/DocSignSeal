'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '../../../components/i18n/useT';
import { STATUS_GROUP, STATUS_LABELS } from '../../../lib/documents/status';
import styles from './page.module.css';

export type DocItem = {
  id: string;
  title: string;
  status: string;
  seal: string | null;
  createdAt: Date;
};

type ChipGroup = 'waiting' | 'signed' | 'draft';

const CHIPS: { group: ChipGroup; labelKey: string }[] = [
  { group: 'waiting', labelKey: 'waiting' },
  { group: 'signed', labelKey: 'f_done' },
  { group: 'draft', labelKey: 'f_draft' },
];

/* Mobile-only card list with filter chips (see page.module.css's
   @media (max-width: 767px) block) -- the existing desktop <ul> in page.tsx
   is untouched and stays visible at wider viewports. Filtering happens
   client-side over the already-fetched list: lib/documents/queries.ts's
   listDocuments() has no filter param and this app has no pagination
   anywhere yet, so there's no volume concern that would call for a new
   query parameter instead. "Declined" documents aren't one of the 3 chips
   (there's no data distinguishing "waiting on you" vs "on others" for
   internal org users, unlike the design mockup's external-signer framing)
   -- they always show in the "Earlier" section below, matching how the
   mockup treats terminal-status documents as separate from the active
   chip-filtered set. */
export function DocumentsList({ items }: { items: DocItem[] }) {
  const t = useT();
  const [active, setActive] = useState<ChipGroup>('waiting');

  const activeItems = items.filter((d) => STATUS_GROUP[d.status] === active);
  const earlier = items.filter((d) => STATUS_GROUP[d.status] === 'declined');

  return (
    <div className={styles.mobileList}>
      <div className={styles.segs}>
        {CHIPS.map((c) => (
          <button
            key={c.group}
            type="button"
            className={styles.seg}
            aria-pressed={active === c.group}
            onClick={() => setActive(c.group)}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {activeItems.length === 0 ? (
        <p className={styles.empty}>{t('no_items_filter')}</p>
      ) : (
        activeItems.map((d) => <DocCard key={d.id} doc={d} />)
      )}

      {earlier.length > 0 && (
        <>
          <h2 className={styles.sectionHeading}>{t('earlier')}</h2>
          {earlier.map((d) => <DocCard key={d.id} doc={d} />)}
        </>
      )}
    </div>
  );
}

function DocCard({ doc }: { doc: DocItem }) {
  const group = STATUS_GROUP[doc.status];
  return (
    <Link href={`/dashboard/documents/${doc.id}`} className={styles.card}>
      <div className={styles.thumb}>{doc.seal && <span className={styles.thumbSeal} />}</div>
      <div className={styles.cardMeta}>
        <b className={styles.cardTitle}>{doc.title}</b>
        <span className={styles.cardSub}>{new Date(doc.createdAt).toLocaleDateString()}</span>
        <span className={`${styles.pill} ${styles[group]}`}>{STATUS_LABELS[doc.status]}</span>
      </div>
    </Link>
  );
}
