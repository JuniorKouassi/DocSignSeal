import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { templates } from '../db/schema';

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
