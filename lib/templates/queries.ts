import 'server-only';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { templateFields, templates } from '../db/schema';

export async function listTemplates(organizationId: string) {
  return db.select().from(templates)
    .where(and(eq(templates.organizationId, organizationId), isNull(templates.archivedAt)))
    .orderBy(desc(templates.createdAt));
}

export async function getTemplate(templateId: string, organizationId: string) {
  const rows = await db.select().from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

/* Caller must have already checked the template belongs to the org (e.g. via
   getTemplate) -- this does not re-check, to avoid a second round trip when
   both are needed together. */
export async function getTemplateFields(templateId: string) {
  return db.select().from(templateFields)
    .where(eq(templateFields.templateId, templateId))
    .orderBy(asc(templateFields.sortOrder));
}
