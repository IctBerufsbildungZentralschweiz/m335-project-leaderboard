import { timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromCookie,
} from '../plugins/session.js';

const loginBodySchema = {
  type: 'object',
  required: ['password'],
  properties: {
    password: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

type LoginBody = { password: string };

interface LockoutEntry {
  count: number;
  firstFailAt: number;
  lockedUntil?: number;
}

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 60_000;
const LOCKOUT_DURATION_MS = 60_000;

const lockouts = new Map<string, LockoutEntry>();

function checkLockout(ip: string): boolean {
  const entry = lockouts.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  return false;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = lockouts.get(ip);
  if (!entry || now - entry.firstFailAt > LOCKOUT_WINDOW_MS) {
    lockouts.set(ip, { count: 1, firstFailAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= LOCKOUT_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
}

function clearFailures(ip: string): void {
  lockouts.delete(ip);
}

function constantTimePasswordCheck(input: string, expected: string): boolean {
  const a = Buffer.from(createHash('sha256').update(input).digest('hex'));
  const b = Buffer.from(createHash('sha256').update(expected).digest('hex'));
  return timingSafeEqual(a, b);
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: LoginBody }>(
    '/admin/login',
    { schema: { body: loginBodySchema } },
    async (request, reply) => {
      const ip = request.ip;

      if (checkLockout(ip)) {
        return reply.status(401).send({ error: 'Too many failed attempts. Try again in 60 seconds.' });
      }

      const adminPassword = process.env.ADMIN_PASSWORD!;
      const ok = constantTimePasswordCheck(request.body.password, adminPassword);

      if (!ok) {
        recordFailure(ip);
        return reply.status(401).send({ error: 'Invalid password' });
      }

      clearFailures(ip);
      const existing = getSessionIdFromCookie(request);
      if (existing) destroySession(existing);

      const session = createSession();
      setSessionCookie(reply, session.id);
      return reply.status(204).send();
    }
  );

  fastify.post('/admin/logout', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (sessionId) destroySession(sessionId);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });
}
