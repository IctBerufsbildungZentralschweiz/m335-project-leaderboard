import Fastify, { type FastifyError } from 'fastify';
import staticPlugin from '@fastify/static';
import cookiePlugin from '@fastify/cookie';
import rateLimitPlugin from '@fastify/rate-limit';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { publicRoutes } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { deleteExpiredSessions } from './db.js';

const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;

if (!adminPassword || adminPassword.length < 16) {
  throw new Error('ADMIN_PASSWORD must be set and at least 16 characters long');
}
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters long');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const fastify = Fastify({ logger: true, trustProxy: true });

fastify.decorateRequest('group', null);
fastify.decorateRequest('adminSession', null);

fastify.setErrorHandler((error: FastifyError, _request, reply) => {
  const status = error.statusCode ?? 500;
  reply.status(status).send({ error: error.message });
});

deleteExpiredSessions();

await fastify.register(cookiePlugin, { secret: sessionSecret });

await fastify.register(rateLimitPlugin, { global: false });

await fastify.register(staticPlugin, {
  root: publicDir,
  prefix: '/',
});

fastify.get('/leaderboard/:slug', (_request, reply) => {
  return reply.sendFile('leaderboard.html');
});

fastify.get('/admin', (_request, reply) => {
  return reply.sendFile('admin/index.html');
});

fastify.get('/admin/login', (_request, reply) => {
  return reply.sendFile('admin/login.html');
});

fastify.get('/admin/handout', (_request, reply) => {
  return reply.sendFile('admin/handout.html');
});

await fastify.register(publicRoutes);
await fastify.register(authRoutes);
await fastify.register(adminRoutes);

const port = parseInt(process.env.PORT ?? '3000', 10);
await fastify.listen({ port, host: '0.0.0.0' });
