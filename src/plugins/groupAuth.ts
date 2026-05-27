import { createHash } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getCohortBySlug, getGroupByTokenHash } from '../db.js';

export async function groupAuthPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers['x-api-token'];
  if (typeof token !== 'string' || token.length === 0) {
    await reply.status(401).send({ error: 'Invalid or missing API token' });
    return;
  }

  const { cohortSlug } = request.params as { cohortSlug: string };
  const cohort = getCohortBySlug(cohortSlug);
  if (!cohort) {
    await reply.status(404).send({ error: 'Cohort not found' });
    return;
  }

  const hash = createHash('sha256').update(token).digest('hex');
  const group = getGroupByTokenHash(hash, cohort.id);
  if (!group) {
    await reply.status(401).send({ error: 'Invalid or missing API token' });
    return;
  }

  request.group = { id: group.id, name: group.name, cohortId: group.cohort_id };
}
