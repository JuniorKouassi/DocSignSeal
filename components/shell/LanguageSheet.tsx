'use client';

import { useState, useTransition } from 'react';
import { setLocale } from '../../lib/i18n/actions';
import { useT } from '../i18n/useT';
import styles from './LanguageSheet.module.css';

type LocaleInfo = { code: string; native: string };

export function LanguageSheet({
  locales,
  currentLocale,
}: {
  locales: LocaleInfo[];
  currentLocale: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const t = useT();

  const rows = locales.filter(
    (l) => !query || l.native.toLowerCase().includes(query.toLowerCase()) || l.code.includes(query.toLowerCase())
  );

  function choose(code: string) {
    startTransition(() => {
      setLocale(code);
    });
    setOpen(false);
  }

  return (
    <>
      <button type="button" className={styles.row} onClick={() => setOpen(true)}>
        <span>{t('language')}</span>
        <span className={styles.value}>
          {locales.find((l) => l.code === currentLocale)?.native ?? currentLocale} ›
        </span>
      </button>

      {open && (
        <div className={styles.sheet} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className={styles.sheetInner}>
            <p className={styles.title}>{t('lang_title')}</p>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search language..."
              className={styles.search}
              autoFocus
            />
            <div>
              {rows.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={styles.langRow}
                  data-selected={l.code === currentLocale}
                  disabled={pending}
                  onClick={() => choose(l.code)}
                >
                  <span>{l.native}</span>
                  <small>{l.code.toUpperCase()}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
