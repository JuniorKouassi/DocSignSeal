'use client';

import { useRef, useState } from 'react';
import { saveTemplateFields, type FieldInput } from '../../../../lib/templates/fields-actions';
import { FIELD_TYPES, FIELD_TYPE_LABELS, FIELD_TYPE_DEFAULT_SIZE, type FieldType } from '../../../../lib/templates/field-types';
import styles from './FieldBuilder.module.css';

type Role = { index: number; label: string };
type Field = FieldInput & { id: string; type: FieldType };

const SIGNER_COLOR_VARS = ['--dss-signer-1', '--dss-signer-2', '--dss-signer-3', '--dss-signer-4'];
const MIN_SIZE = { w: 3, h: 2 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function FieldBuilder({
  templateId,
  pageCount,
  signerRoles,
  initialFields,
}: {
  templateId: string;
  pageCount: number;
  signerRoles: Role[];
  initialFields: Field[];
}) {
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [activeRole, setActiveRole] = useState(signerRoles[0]?.index ?? 0);
  const [activeType, setActiveType] = useState<FieldType>('signature');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const surfaceRefs = useRef(new Map<number, HTMLDivElement>());
  const dragRef = useRef<
    | { mode: 'move' | 'resize'; id: string; page: number; startX: number; startY: number; field: Field }
    | null
  >(null);

  function addField(page: number, clientX: number, clientY: number) {
    const surface = surfaceRefs.current.get(page);
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const { w, h } = FIELD_TYPE_DEFAULT_SIZE[activeType];
    const xPct = clamp(((clientX - rect.left) / rect.width) * 100 - w / 2, 0, 100 - w);
    const yPct = clamp(((clientY - rect.top) / rect.height) * 100 - h / 2, 0, 100 - h);

    const field: Field = {
      id: crypto.randomUUID(),
      signerIndex: activeRole,
      page,
      x: xPct,
      y: yPct,
      w,
      h,
      type: activeType,
      required: true,
      meta: {},
    };
    setFields((fs) => [...fs, field]);
    setSelectedId(field.id);
  }

  function updateField(id: string, patch: Partial<Field>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }

  function onFieldPointerDown(e: React.PointerEvent, field: Field, mode: 'move' | 'resize') {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelectedId(field.id);
    dragRef.current = { mode, id: field.id, page: field.page, startX: e.clientX, startY: e.clientY, field };
  }

  function onSurfacePointerMove(e: React.PointerEvent, page: number) {
    const drag = dragRef.current;
    if (!drag || drag.page !== page) return;
    const surface = surfaceRefs.current.get(page);
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;

    if (drag.mode === 'move') {
      const x = clamp(drag.field.x + dxPct, 0, 100 - drag.field.w);
      const y = clamp(drag.field.y + dyPct, 0, 100 - drag.field.h);
      updateField(drag.id, { x, y });
    } else {
      const w = clamp(drag.field.w + dxPct, MIN_SIZE.w, 100 - drag.field.x);
      const h = clamp(drag.field.h + dyPct, MIN_SIZE.h, 100 - drag.field.y);
      updateField(drag.id, { w, h });
    }
  }

  function onSurfacePointerUp() {
    dragRef.current = null;
  }

  function onSurfaceClick(e: React.MouseEvent, page: number) {
    if (e.target !== surfaceRefs.current.get(page)?.querySelector('img')) return;
    addField(page, e.clientX, e.clientY);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const payload: FieldInput[] = fields.map((f) => ({
      signerIndex: f.signerIndex,
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      type: f.type,
      required: f.required,
      meta: f.meta,
    }));
    const result = await saveTemplateFields(templateId, payload);
    setSaving(false);
    setStatus(result.ok ? { kind: 'ok', message: 'Saved.' } : { kind: 'error', message: result.error });
  }

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Signer role</span>
          {signerRoles.map((role) => (
            <button
              key={role.index}
              type="button"
              className={styles.roleTab}
              style={{
                borderColor: activeRole === role.index ? `var(${SIGNER_COLOR_VARS[role.index % 4]})` : undefined,
                color: activeRole === role.index ? `var(${SIGNER_COLOR_VARS[role.index % 4]})` : undefined,
              }}
              onClick={() => setActiveRole(role.index)}
            >
              {role.label}
            </button>
          ))}
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Field type</span>
          {FIELD_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`${styles.typeTab} ${activeType === type ? styles.active : ''}`}
              onClick={() => setActiveType(type)}
            >
              {FIELD_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <p className={styles.hint}>Click a page to place a field. Drag to move, drag the corner to resize.</p>

        {selected && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Selected</span>
            <label>
              <input
                type="checkbox"
                checked={selected.required}
                onChange={(e) => updateField(selected.id, { required: e.target.checked })}
              />{' '}
              Required
            </label>
            <button type="button" className={styles.roleTab} onClick={() => removeField(selected.id)}>
              Delete field
            </button>
          </div>
        )}

        <div className={styles.row}>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save fields'}
          </button>
          {status && <span className={`${styles.status} ${styles[status.kind]}`}>{status.message}</span>}
        </div>
      </div>

      {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
        <div className={styles.pageWrap} key={page}>
          <p className={styles.pageLabel}>Page {page}</p>
          <div
            className={styles.surface}
            ref={(el) => {
              if (el) surfaceRefs.current.set(page, el);
              else surfaceRefs.current.delete(page);
            }}
            onClick={(e) => onSurfaceClick(e, page)}
            onPointerMove={(e) => onSurfacePointerMove(e, page)}
            onPointerUp={onSurfacePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static asset */}
            <img src={`/api/templates/${templateId}/pages/${page}`} alt={`Page ${page}`} draggable={false} />

            {fields.filter((f) => f.page === page).map((f) => (
              <div
                key={f.id}
                className={`${styles.field} ${selectedId === f.id ? styles.selected : ''}`}
                style={{
                  left: `${f.x}%`,
                  top: `${f.y}%`,
                  width: `${f.w}%`,
                  height: `${f.h}%`,
                  ['--field-color' as string]: `var(${SIGNER_COLOR_VARS[f.signerIndex % 4]})`,
                }}
                onPointerDown={(e) => onFieldPointerDown(e, f, 'move')}
              >
                <span className={styles.fieldLabel}>
                  {FIELD_TYPE_LABELS[f.type]} · {signerRoles.find((r) => r.index === f.signerIndex)?.label}
                </span>
                <button
                  type="button"
                  className={styles.remove}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                >
                  ×
                </button>
                <div
                  className={styles.resizeHandle}
                  onPointerDown={(e) => onFieldPointerDown(e, f, 'resize')}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
