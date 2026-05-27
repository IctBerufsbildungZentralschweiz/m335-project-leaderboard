import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getCohortBySlug,
  insertRun,
  getLeaderboard,
  getLastSubmittedAt,
  getAllCohorts,
} from '../db.js';
import { assignRanks } from '../ranking.js';
import { groupAuthPreHandler } from '../plugins/groupAuth.js';

const postRunsBodySchema = {
  type: 'object',
  required: ['playerName', 'schnitzel', 'kartoffeln', 'durationSeconds'],
  properties: {
    playerName: { type: 'string', minLength: 1, maxLength: 80 },
    schnitzel: { type: 'integer', minimum: 0, maximum: 10 },
    kartoffeln: { type: 'integer', minimum: 0, maximum: 10 },
    durationSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
  },
  additionalProperties: false,
} as const;

type PostRunsBody = {
  playerName: string;
  schnitzel: number;
  kartoffeln: number;
  durationSeconds: number;
};

const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX ?? '10', 10);

export async function publicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { cohortSlug: string }; Body: PostRunsBody }>(
    '/api/:cohortSlug/runs',
    {
      schema: { body: postRunsBodySchema },
      preHandler: groupAuthPreHandler,
      config: {
        rateLimit: {
          max: rateLimitMax,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) =>
            String(req.headers['x-api-token'] ?? req.ip),
        },
      },
    },
    async (request, reply) => {
      const group = request.group!;
      const cohort = getCohortBySlug(request.params.cohortSlug)!;
      const { playerName, schnitzel, kartoffeln, durationSeconds } = request.body;

      const id = insertRun({
        cohortId: cohort.id,
        groupId: group.id,
        playerName,
        schnitzel,
        kartoffeln,
        durationSeconds,
      });

      return reply.status(201).send({
        id,
        playerName,
        groupName: group.name,
        schnitzel,
        kartoffeln,
        durationSeconds,
        submittedAt: new Date().toISOString(),
      });
    }
  );

  fastify.get<{ Params: { cohortSlug: string }; Querystring: { limit?: string } }>(
    '/api/:cohortSlug/leaderboard',
    async (request, reply) => {
      const cohort = getCohortBySlug(request.params.cohortSlug);
      if (!cohort) {
        return reply.status(404).send({ error: 'Cohort not found' });
      }

      const rawLimit = parseInt(request.query.limit ?? '100', 10);
      const limit = Number.isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 500);

      const rows = getLeaderboard(cohort.id, limit);
      const entries = assignRanks(rows);
      const updatedAt = getLastSubmittedAt(cohort.id);

      return reply.send({
        cohort: { name: cohort.name, slug: cohort.slug },
        updatedAt,
        entries,
      });
    }
  );

  fastify.get('/api/cohorts', async (_request, reply) => {
    return reply.send(getAllCohorts());
  });
}
