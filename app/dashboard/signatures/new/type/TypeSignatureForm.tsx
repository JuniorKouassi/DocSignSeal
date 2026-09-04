'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '../../../../../components/i18n/useT';
import { createSignature } from '../../../../../lib/signatures/actions';
import { pngFromTypedSignature } from '../../../../../lib/signatures/renderTyped';
import { CaptureHeader } from '../../../../../components/signatures/CaptureHeader';
import { InkColorRow } from '../../../../../components/signatures/InkColorRow';
import { DEFAULT_INK, inkHex, type InkColorKey } from '../../../../../components/signatures/inkColors';
import { FONT_PRESETS, fontFamilyFor, type FontPresetKey } from '../../../../../components/signatures/fontPresets';
import styles from './page.module.css';

export function TypeSignatureForm({ initialName }: { initialName: string }) {
  const t = useT();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createSignature, undefined);
  const [text, setText] = useState(initialName);
  // Defaults to the script preset, not the first ("sans") one -- a typed
  // signature should read as handwriting by default, matching how
  // design/mobile-ui.html's own .sigimg preview already renders signatures
  // (Brush Script stack), not as plain UI text.
  const [fontKey, setFontKey] = useState<FontPresetKey>('scriptA');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [color, setColor] = useState<InkColorKey>(DEFAULT_INK);

  useEffect(() => {
    if (state && 'ok' in state) router.push('/dashboard/signatures');
  }, [state, router]);

  const hasText = text.trim().length > 0;
  const previewStyle = {
    fontFamily: fontFamilyFor(fontKey),
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal',
    color: inkHex(color),
  } as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasText || pending) return;

    const blob = await pngFromTypedSignature({
      text: text.trim(),
      fontFamily: fontFamilyFor(fontKey),
      bold,
      italic,
      color: inkHex(color),
    });

    const formData = new FormData();
    formData.set('kind', 'signature');
    formData.set('file', blob, 'signature.png');
    formAction(formData);
  }

  return (
    <form onSubmit={handleSubmit} className={styles.screen}>
      <CaptureHeader title={t('new_signature')} saveDisabled={!hasText} pending={pending} />

      {state && 'errors' in state && state.errors && (
        <p className={styles.formError}>{Object.values(state.errors)[0]}</p>
      )}

      <div className={styles.pad}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={styles.preview}
          style={previewStyle}
          autoFocus
          aria-label={t('new_signature')}
        />
        <div className={styles.baseline} />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.fontRow}>
          {FONT_PRESETS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={styles.fontSwatch}
              data-selected={fontKey === f.key}
              style={{ fontFamily: f.family }}
              onClick={() => setFontKey(f.key)}
              aria-label={f.key}
            >
              Aa
            </button>
          ))}
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.styleToggle}
            data-active={bold}
            aria-pressed={bold}
            aria-label={t('bold')}
            onClick={() => setBold((v) => !v)}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            className={styles.styleToggle}
            data-active={italic}
            aria-pressed={italic}
            aria-label={t('italic')}
            onClick={() => setItalic((v) => !v)}
          >
            <i>I</i>
          </button>
        </div>
        <InkColorRow value={color} onChange={setColor} onClear={() => setText('')} />
      </div>
    </form>
  );
}
