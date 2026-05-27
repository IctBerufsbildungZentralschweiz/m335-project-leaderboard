import { randomBytes } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { insertSession, getSession, deleteSession, deleteExpiredSessions } from '../db.js';

const TTL_HOURS = parseInt(process.env.ADMIN_SESSION_TTL_HOURS ?? '8', 10);
const TTL_SECONDS = TTL_HOURS * 3600;
const COOKIE_NAME = 'admin_session';

export function createSession(): { id: string; expiresAt: string } {
  deleteExpiredSessions();
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  insertSession(id, expiresAt);
  return { id, expiresAt };
}

export function destroySession(id: string): void {
  deleteSession(id);
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
    signed: true,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function getSessionIdFromCookie(request: FastifyRequest): string | null {
  const unsigned = request.unsignCookie(request.cookies[COOKIE_NAME] ?? '');
  if (!unsigned.valid) return null;
  return unsigned.value ?? null;
}

export async function adminAuthPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionId = getSessionIdFromCookie(request);
  if (!sessionId) {
    await reply.status(401).send({ error: 'Unauthorised' });
    return;
  }

  const session = getSession(sessionId);
  if (!session || new Date(session.expires_at) <= new Date()) {
    if (session) deleteSession(sessionId);
    await reply.status(401).send({ error: 'Unauthorised' });
    return;
  }

  request.adminSession = { id: sessionId };
}
