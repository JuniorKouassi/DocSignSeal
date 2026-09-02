'use server';

import { eq } from 'drizzle-orm';
import { getCurrentContext } from '../auth/dal';
import { db } from '../db/client';
import { templateFields } from '../db/schema';
import { getTemplate } from './queries';
import { isFieldType, type FieldType } from './field-types';

export type FieldInput = {
  signerIndex: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
  required: boolean;
  meta: Record<string, unknown>;
};

export type SaveFieldsResult = { ok: true } | { ok: false; error: string };

function inRange(n: unknown, min: number, max: number) {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

/* PUT /fields from spec/schema-and-api.md: replaces the whole field set for
   a template atomically. The neon-http driver has no db.transaction(), so
   this uses db.batch() -- Neon's HTTP driver sends the delete and every
   insert as one atomic round trip, which is what "atomically" requires here:
   a page reload mid-save must never see half the old set and half the new
   one. */
export async function saveTemplateFields(templateId: string, fields: FieldInput[]): Promise<SaveFieldsResult> {
  const { organization } = await getCurrentContext();

  const template = await getTemplate(templateId, organization.id);
  if (!template) return { ok: false, error: 'Template not found.' };

  const roleIndexes = new Set(template.signerRoles.map((r) => r.index));

  for (const f of fields) {
    if (!roleIndexes.has(f.signerIndex)) return { ok: false, error: 'Unknown signer role.' };
    if (!inRange(f.page, 1, template.pageCount)) return { ok: false, error: 'Field placed on a page outside this document.' };
    if (!inRange(f.x, 0, 100) || !inRange(f.y, 0, 100) || !inRange(f.w, 0, 100) || !inRange(f.h, 0, 100)) {
      return { ok: false, error: 'Field position is out of bounds.' };
    }
    if (!isFieldType(f.type)) return { ok: false, error: `Unknown field type: ${f.type}` };
  }

  const deleteExisting = db.delete(templateFields).where(eq(templateFields.templateId, templateId));
  const inserts = fields.map((f, index) => db.insert(templateFields).values({
    templateId,
    signerIndex: f.signerIndex,
    page: f.page,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    // Validated by isFieldType() in the loop above.
    type: f.type as FieldType,
    required: f.required,
    meta: f.meta ?? {},
    sortOrder: index,
  }));

  if (inserts.length === 0) {
    await deleteExisting;
  } else {
    const [first, ...rest] = inserts;
    await db.batch([deleteExisting, first, ...rest]);
  }

  return { ok: true };
}
