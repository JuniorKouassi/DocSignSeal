import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { conversionJobs } from '../db/schema';

export async function getConversionJob(jobId: string, organizationId: string) {
  const rows = await db.select().from(conversionJobs)
    .where(and(eq(conversionJobs.id, jobId), eq(conversionJobs.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listConversionJobs(organizationId: string) {
  return db.select().from(conversionJobs)
    .where(eq(conversionJobs.organizationId, organizationId))
    .orderBy(desc(conversionJobs.createdAt));
}
