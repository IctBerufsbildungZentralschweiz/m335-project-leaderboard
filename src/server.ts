import Fastify, { type FastifyError } from 'fastify';
import staticPlugin from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { publicRoutes } from './routes/public.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const fastify = Fastify({ logger: true });

fastify.decorateRequest('group', null);

fastify.setErrorHandler((error: FastifyError, _request, reply) => {
  const status = error.statusCode ?? 500;
  reply.status(status).send({ error: error.message });
});

await fastify.register(staticPlugin, {
  root: publicDir,
  prefix: '/',
});

fastify.get('/leaderboard/:slug', (_request, reply) => {
  return reply.sendFile('leaderboard.html');
});

await fastify.register(publicRoutes);

const port = parseInt(process.env.PORT ?? '3000', 10);
await fastify.listen({ port, host: '0.0.0.0' });
