'use client';

import { useT } from '../i18n/useT';
import { INK_COLORS, type InkColorKey } from './inkColors';
import styles from './InkColorRow.module.css';

export function InkColorRow({ value, onChange, onClear }: {
  value: InkColorKey;
  onChange: (key: InkColorKey) => void;
  onClear: () => void;
}) {
  const t = useT();

  return (
    <div className={styles.row}>
      <div className={styles.swatches}>
        {INK_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.swatch}
            data-selected={value === c.key}
            style={{ background: c.hex }}
            aria-label={c.key}
            aria-pressed={value === c.key}
            onClick={() => onChange(c.key)}
          />
        ))}
      </div>
      <button type="button" className={styles.clear} onClick={onClear}>
        {t('clear')}
      </button>
    </div>
  );
}
