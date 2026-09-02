'use client';

import { useRef, useState, useTransition } from 'react';
import { saveFieldValue, uploadAttachment, declineSigning } from '../../../lib/signing/actions';
import { FIELD_TYPE_LABELS, type FieldType } from '../../../lib/templates/field-types';
import styles from './SigningView.module.css';

type Stroke = { x: number; y: number }[];

type SigningField = {
  id: string;
  signerId: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: FieldType;
  required: boolean;
  meta: Record<string, unknown>;
  valueText: string | null;
  valueFileId: string | null;
  strokeData: Stroke[] | null;
  signerStatus: string;
};

export default function SigningView({
  token,
  pageCount,
  signerId,
  editable,
  fields,
}: {
  token: string;
  pageCount: number;
  signerId: string;
  editable: boolean;
  fields: SigningField[];
}) {
  const [declinePending, startDeclineTransition] = useTransition();
  const [declineError, setDeclineError] = useState<string | null>(null);

  function handleDecline() {
    const reason = window.prompt('Reason for declining (optional):', '') ?? '';
    setDeclineError(null);
    startDeclineTransition(async () => {
      const result = await declineSigning(token, reason);
      if (result.ok) window.location.reload();
      else setDeclineError(result.error);
    });
  }

  return (
    <div>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
        <div className={styles.pageWrap} key={page}>
          <p className={styles.pageLabel}>Page {page}</p>
          <div className={styles.surface}>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static asset */}
            <img src={`/api/sign/${token}/pages/${page}`} alt={`Page ${page}`} />
            {fields.filter((f) => f.page === page).map((f) => (
              <FieldControl key={f.id} token={token} field={f} isOwn={f.signerId === signerId} editable={editable} />
            ))}
          </div>
        </div>
      ))}

      <div className={styles.actions}>
        <button type="button" className={styles.declineBtn} onClick={handleDecline} disabled={declinePending}>
          {declinePending ? 'Declining…' : 'Decline to sign'}
        </button>
      </div>
      {declineError && <p style={{ color: 'var(--dss-declined-fg)', fontSize: 13, textAlign: 'right' }}>{declineError}</p>}
    </div>
  );
}

function FieldControl({
  token,
  field,
  isOwn,
  editable,
}: {
  token: string;
  field: SigningField;
  isOwn: boolean;
  editable: boolean;
}) {
  const box: React.CSSProperties = {
    left: `${field.x}%`,
    top: `${field.y}%`,
    width: `${field.w}%`,
    height: `${field.h}%`,
  };

  if (!isOwn) {
    const hasValue = field.signerStatus === 'signed';
    return (
      <div className={`${styles.field} ${styles.other}`} style={box}>
        {hasValue && (
          <span className={styles.otherValue}>
            {field.type === 'signature' || field.type === 'initials' ? 'Signed' : field.valueText || FIELD_TYPE_LABELS[field.type]}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.field} ${styles.own}`} style={box}>
      <OwnFieldInput token={token} field={field} disabled={!editable} />
    </div>
  );
}

function useSaveStatus() {
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return { saved, pending, startTransition, flashSaved };
}

/* Dispatches to a type-specific component rather than branching internally,
   so each mounted field always calls the same hooks in the same order --
   branching with hooks inside one component per field.type would violate
   the Rules of Hooks even though field.type never changes after mount. */
function OwnFieldInput({ token, field, disabled }: { token: string; field: SigningField; disabled: boolean }) {
  switch (field.type) {
    case 'checkbox': return <CheckboxInput token={token} field={field} disabled={disabled} />;
    case 'dropdown': return <DropdownInput token={token} field={field} disabled={disabled} />;
    case 'signature':
    case 'initials': return <DrawingPad token={token} field={field} disabled={disabled} />;
    case 'attachment': return <AttachmentInput token={token} field={field} disabled={disabled} />;
    default: return <TextInput token={token} field={field} disabled={disabled} />;
  }
}

function CheckboxInput({ token, field, disabled }: { token: string; field: SigningField; disabled: boolean }) {
  const { saved, startTransition, flashSaved } = useSaveStatus();
  const [checked, setChecked] = useState(field.valueText === 'true');
  return (
    <div className={styles.checkboxCell}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          setChecked(e.target.checked);
          startTransition(async () => {
            await saveFieldValue(token, field.id, { valueText: e.target.checked ? 'true' : 'false' });
            flashSaved();
          });
        }}
      />
      {saved && <span className={styles.savedMark}>Saved</span>}
    </div>
  );
}

function DropdownInput({ token, field, disabled }: { token: string; field: SigningField; disabled: boolean }) {
  const { saved, startTransition, flashSaved } = useSaveStatus();
  const options = Array.isArray(field.meta.options) ? (field.meta.options as string[]) : [];
  const [value, setValue] = useState(field.valueText ?? '');
  return (
    <>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          startTransition(async () => {
            await saveFieldValue(token, field.id, { valueText: e.target.value });
            flashSaved();
          });
        }}
      >
        <option value="">Choose…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {saved && <span className={styles.savedMark}>Saved</span>}
    </>
  );
}

function AttachmentInput({ token, field, disabled }: { token: string; field: SigningField; disabled: boolean }) {
  const { saved, pending, startTransition, flashSaved } = useSaveStatus();
  return (
    <div className={styles.fileCell}>
      <input
        type="file"
        disabled={disabled || pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const formData = new FormData();
          formData.set('file', file);
          startTransition(async () => {
            await uploadAttachment(token, field.id, formData);
            flashSaved();
          });
        }}
      />
      {saved && <span className={styles.savedMark}>Saved</span>}
    </div>
  );
}

function TextInput({ token, field, disabled }: { token: string; field: SigningField; disabled: boolean }) {
  const { saved, startTransition, flashSaved } = useSaveStatus();
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  const [value, setValue] = useState(field.valueText ?? '');
  return (
    <>
      <input
        type={inputType}
        value={value}
        disabled={disabled}
        placeholder={typeof field.meta.placeholder === 'string' ? field.meta.placeholder : ''}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          startTransition(async () => {
            await saveFieldValue(token, field.id, { valueText: value });
            flashSaved();
          });
        }}
      />
      {saved && <span className={styles.savedMark}>Saved</span>}
    </>
  );
}

function DrawingPad({ token, field, disabled }: { token: string; field: SigningField; disabled: boolean }) {
  const { saved, pending, startTransition, flashSaved } = useSaveStatus();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>(field.strokeData ?? []);
  const drawingRef = useRef<Stroke | null>(null);
  const [hasStrokes, setHasStrokes] = useState((field.strokeData ?? []).length > 0);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--dss-ink-blue') || '#1B3FA8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const stroke of strokesRef.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => {
        const x = (p.x / 100) * canvas.width;
        const y = (p.y / 100) * canvas.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  function toPercent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = [toPercent(e)];
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current.push(toPercent(e));
    redraw();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas && drawingRef.current.length > 1) {
      ctx.beginPath();
      drawingRef.current.forEach((p, i) => {
        const x = (p.x / 100) * canvas.width;
        const y = (p.y / 100) * canvas.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    strokesRef.current = [...strokesRef.current, drawingRef.current];
    drawingRef.current = null;
    setHasStrokes(true);
    startTransition(async () => {
      await saveFieldValue(token, field.id, { strokeData: strokesRef.current });
      flashSaved();
    });
  }

  function clear() {
    strokesRef.current = [];
    setHasStrokes(false);
    redraw();
    startTransition(async () => {
      await saveFieldValue(token, field.id, { strokeData: [] });
      flashSaved();
    });
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {!disabled && hasStrokes && (
        <button type="button" className={styles.clearBtn} onClick={clear} disabled={pending}>Clear</button>
      )}
      <canvas
        ref={(el) => { canvasRef.current = el; if (el) { el.width = el.clientWidth; el.height = el.clientHeight; redraw(); } }}
        className={styles.drawCanvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {saved && <span className={styles.savedMark}>Saved</span>}
    </div>
  );
}
