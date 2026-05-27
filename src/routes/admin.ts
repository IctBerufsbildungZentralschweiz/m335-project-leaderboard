import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  getAllCohorts,
  getCohortById,
  insertCohort,
  deleteCohort,
  getCohortBySlug,
  getGroupsByCohort,
  getGroupById,
  insertGroup,
  updateGroupTokenHash,
  deleteGroup,
  getRunsByCohort,
} from '../db.js';
import { adminAuthPreHandler } from '../plugins/session.js';
import { formatDuration } from '../time.js';

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(16).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function isFkError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
}

function isUniqueError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

const createCohortSchema = {
  type: 'object',
  required: ['name', 'slug'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    slug: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-z0-9-]+$' },
  },
  additionalProperties: false,
} as const;

const createGroupSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
  },
  additionalProperties: false,
} as const;

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', adminAuthPreHandler);

  // --- Cohorts ---

  fastify.get('/admin/cohorts', async (_request, reply) => {
    return reply.send(getAllCohorts().map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      createdAt: c.created_at,
    })));
  });

  fastify.post<{ Body: { name: string; slug: string } }>(
    '/admin/cohorts',
    { schema: { body: createCohortSchema } },
    async (request, reply) => {
      const { name, slug } = request.body;
      const existing = getCohortBySlug(slug);
      if (existing) {
        return reply.status(409).send({ error: `Cohort with slug "${slug}" already exists` });
      }
      try {
        const id = insertCohort(name, slug);
        return reply.status(201).send({ id, name, slug });
      } catch (e) {
        if (isUniqueError(e)) {
          return reply.status(409).send({ error: `Cohort with slug "${slug}" already exists` });
        }
        throw e;
      }
    }
  );

  fastify.delete<{ Params: { cohortId: string } }>(
    '/admin/cohorts/:cohortId',
    async (request, reply) => {
      const cohortId = parseInt(request.params.cohortId, 10);
      const cohort = getCohortById(cohortId);
      if (!cohort) return reply.status(404).send({ error: 'Cohort not found' });
      try {
        deleteCohort(cohortId);
        return reply.status(204).send();
      } catch (e) {
        if (isFkError(e)) {
          return reply.status(409).send({ error: 'Cohort has groups or runs and cannot be deleted' });
        }
        throw e;
      }
    }
  );

  // --- Groups ---

  fastify.get<{ Params: { cohortId: string } }>(
    '/admin/cohorts/:cohortId/groups',
    async (request, reply) => {
      const cohortId = parseInt(request.params.cohortId, 10);
      if (!getCohortById(cohortId)) return reply.status(404).send({ error: 'Cohort not found' });
      const groups = getGroupsByCohort(cohortId);
      return reply.send(groups.map(g => ({ id: g.id, name: g.name, createdAt: g.created_at })));
    }
  );

  fastify.post<{ Params: { cohortId: string }; Body: { name: string } }>(
    '/admin/cohorts/:cohortId/groups',
    { schema: { body: createGroupSchema } },
    async (request, reply) => {
      const cohortId = parseInt(request.params.cohortId, 10);
      if (!getCohortById(cohortId)) return reply.status(404).send({ error: 'Cohort not found' });
      const { name } = request.body;
      const { token, tokenHash } = generateToken();
      const id = insertGroup(cohortId, name, tokenHash);
      return reply.status(201).send({ id, name, cohortId, apiToken: token });
    }
  );

  fastify.post<{ Params: { groupId: string } }>(
    '/admin/groups/:groupId/reset-token',
    async (request, reply) => {
      const groupId = parseInt(request.params.groupId, 10);
      const group = getGroupById(groupId);
      if (!group) return reply.status(404).send({ error: 'Group not found' });
      const { token, tokenHash } = generateToken();
      updateGroupTokenHash(groupId, tokenHash);
      return reply.send({ id: groupId, name: group.name, apiToken: token });
    }
  );

  fastify.delete<{ Params: { groupId: string } }>(
    '/admin/groups/:groupId',
    async (request, reply) => {
      const groupId = parseInt(request.params.groupId, 10);
      if (!getGroupById(groupId)) return reply.status(404).send({ error: 'Group not found' });
      try {
        deleteGroup(groupId);
        return reply.status(204).send();
      } catch (e) {
        if (isFkError(e)) {
          return reply.status(409).send({ error: 'Group has runs and cannot be deleted' });
        }
        throw e;
      }
    }
  );

  // --- Runs ---

  fastify.get<{ Params: { cohortId: string } }>(
    '/admin/cohorts/:cohortId/runs',
    async (request, reply) => {
      const cohortId = parseInt(request.params.cohortId, 10);
      if (!getCohortById(cohortId)) return reply.status(404).send({ error: 'Cohort not found' });
      const runs = getRunsByCohort(cohortId);
      return reply.send(runs.map(r => ({
        id: r.id,
        groupId: r.group_id,
        groupName: r.group_name,
        playerName: r.player_name,
        schnitzel: r.schnitzel,
        kartoffeln: r.kartoffeln,
        durationSeconds: r.duration_seconds,
        duration: formatDuration(r.duration_seconds),
        submittedAt: r.submitted_at,
      })));
    }
  );
}
