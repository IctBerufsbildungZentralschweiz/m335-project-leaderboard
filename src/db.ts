import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CohortRow, GroupRow, LeaderboardRow, AdminSessionRow, RunWithGroupRow } from './types.js';

const dbPath = process.env.DATABASE_PATH ?? './data/leaderboard.db';
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- migrations ---
const version = db.pragma('user_version', { simple: true }) as number;
if (version < 1) {
  db.exec(`
    CREATE TABLE cohorts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE groups (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      cohort_id       INTEGER NOT NULL REFERENCES cohorts(id),
      name            TEXT NOT NULL,
      api_token_hash  TEXT NOT NULL UNIQUE,
      created_at      TEXT NOT NULL
    );

    CREATE TABLE runs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      cohort_id        INTEGER NOT NULL REFERENCES cohorts(id),
      group_id         INTEGER NOT NULL REFERENCES groups(id),
      player_name      TEXT NOT NULL,
      schnitzel        INTEGER NOT NULL CHECK(schnitzel >= 0),
      kartoffeln       INTEGER NOT NULL CHECK(kartoffeln >= 0),
      duration_seconds INTEGER NOT NULL CHECK(duration_seconds > 0),
      submitted_at     TEXT NOT NULL
    );

    CREATE INDEX idx_runs_cohort ON runs(cohort_id);
    CREATE INDEX idx_runs_leaderboard ON runs(
      cohort_id, schnitzel DESC, kartoffeln ASC, duration_seconds ASC, submitted_at ASC
    );
  `);
  db.pragma('user_version = 1');
}

if (version < 2) {
  db.exec(`
    CREATE TABLE admin_sessions (
      id         TEXT NOT NULL PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_sessions_expires ON admin_sessions(expires_at);
  `);
  db.pragma('user_version = 2');
}

// --- prepared statements ---
const _getCohortBySlug = db.prepare<{ slug: string }, CohortRow>(
  'SELECT id, name, slug, created_at FROM cohorts WHERE slug = :slug'
);

const _getCohortById = db.prepare<{ id: number }, CohortRow>(
  'SELECT id, name, slug, created_at FROM cohorts WHERE id = :id'
);

const _getGroupByTokenHash = db.prepare<{ hash: string; cohort_id: number }, GroupRow>(
  'SELECT id, name, cohort_id FROM groups WHERE api_token_hash = :hash AND cohort_id = :cohort_id'
);

const _getGroupById = db.prepare<{ id: number }, GroupRow>(
  'SELECT id, name, cohort_id, api_token_hash, created_at FROM groups WHERE id = :id'
);

const _insertRun = db.prepare<{
  cohort_id: number; group_id: number; player_name: string;
  schnitzel: number; kartoffeln: number; duration_seconds: number; submitted_at: string;
}>(`
  INSERT INTO runs (cohort_id, group_id, player_name, schnitzel, kartoffeln, duration_seconds, submitted_at)
  VALUES (:cohort_id, :group_id, :player_name, :schnitzel, :kartoffeln, :duration_seconds, :submitted_at)
`);

const _getLeaderboard = db.prepare<{ cohort_id: number; limit: number }, LeaderboardRow>(`
  SELECT r.id, r.player_name, g.name AS group_name, r.schnitzel, r.kartoffeln, r.duration_seconds, r.submitted_at
  FROM runs r
  JOIN groups g ON g.id = r.group_id
  WHERE r.cohort_id = :cohort_id
  ORDER BY r.schnitzel DESC, r.kartoffeln ASC, r.duration_seconds ASC, r.submitted_at ASC
  LIMIT :limit
`);

const _getLastSubmittedAt = db.prepare<{ cohort_id: number }, { last: string | null }>(
  'SELECT MAX(submitted_at) AS last FROM runs WHERE cohort_id = :cohort_id'
);

const _getAllCohorts = db.prepare<[], CohortRow>(
  'SELECT id, name, slug, created_at FROM cohorts ORDER BY created_at DESC'
);

const _insertCohort = db.prepare<{ name: string; slug: string; created_at: string }>(
  'INSERT INTO cohorts (name, slug, created_at) VALUES (:name, :slug, :created_at)'
);

const _insertGroup = db.prepare<{ cohort_id: number; name: string; api_token_hash: string; created_at: string }>(
  'INSERT INTO groups (cohort_id, name, api_token_hash, created_at) VALUES (:cohort_id, :name, :api_token_hash, :created_at)'
);

const _updateGroupTokenHash = db.prepare<{ id: number; api_token_hash: string }>(
  'UPDATE groups SET api_token_hash = :api_token_hash WHERE id = :id'
);

const _deleteGroup = db.prepare<{ id: number }>(
  'DELETE FROM groups WHERE id = :id'
);

const _deleteCohort = db.prepare<{ id: number }>(
  'DELETE FROM cohorts WHERE id = :id'
);

const _getGroupsByCohort = db.prepare<{ cohort_id: number }, { id: number; name: string; created_at: string }>(
  'SELECT id, name, created_at FROM groups WHERE cohort_id = :cohort_id ORDER BY created_at ASC'
);

const _getRunsByCohort = db.prepare<{ cohort_id: number }, RunWithGroupRow>(`
  SELECT r.id, r.group_id, g.name AS group_name, r.player_name, r.schnitzel, r.kartoffeln, r.duration_seconds, r.submitted_at
  FROM runs r
  JOIN groups g ON g.id = r.group_id
  WHERE r.cohort_id = :cohort_id
  ORDER BY r.submitted_at DESC
`);

const _insertSession = db.prepare<{ id: string; expires_at: string; created_at: string }>(
  'INSERT INTO admin_sessions (id, expires_at, created_at) VALUES (:id, :expires_at, :created_at)'
);

const _getSession = db.prepare<{ id: string }, AdminSessionRow>(
  'SELECT id, expires_at, created_at FROM admin_sessions WHERE id = :id'
);

const _deleteSession = db.prepare<{ id: string }>(
  'DELETE FROM admin_sessions WHERE id = :id'
);

const _deleteExpiredSessions = db.prepare<{ now: string }>(
  'DELETE FROM admin_sessions WHERE expires_at <= :now'
);

// --- typed query helpers ---

export function getCohortBySlug(slug: string): CohortRow | undefined {
  return _getCohortBySlug.get({ slug });
}

export function getCohortById(id: number): CohortRow | undefined {
  return _getCohortById.get({ id });
}

export function getGroupByTokenHash(hash: string, cohortId: number): GroupRow | undefined {
  return _getGroupByTokenHash.get({ hash, cohort_id: cohortId });
}

export function getGroupById(id: number): GroupRow | undefined {
  return _getGroupById.get({ id });
}

export function insertRun(params: {
  cohortId: number; groupId: number; playerName: string;
  schnitzel: number; kartoffeln: number; durationSeconds: number;
}): number {
  const result = _insertRun.run({
    cohort_id: params.cohortId,
    group_id: params.groupId,
    player_name: params.playerName,
    schnitzel: params.schnitzel,
    kartoffeln: params.kartoffeln,
    duration_seconds: params.durationSeconds,
    submitted_at: new Date().toISOString(),
  });
  return result.lastInsertRowid as number;
}

export function getLeaderboard(cohortId: number, limit: number): LeaderboardRow[] {
  return _getLeaderboard.all({ cohort_id: cohortId, limit });
}

export function getLastSubmittedAt(cohortId: number): string | null {
  const row = _getLastSubmittedAt.get({ cohort_id: cohortId });
  return row?.last ?? null;
}

export function getAllCohorts(): CohortRow[] {
  return _getAllCohorts.all();
}

export function insertCohort(name: string, slug: string): number {
  const result = _insertCohort.run({ name, slug, created_at: new Date().toISOString() });
  return result.lastInsertRowid as number;
}

export function insertGroup(cohortId: number, name: string, tokenHash: string): number {
  const result = _insertGroup.run({
    cohort_id: cohortId,
    name,
    api_token_hash: tokenHash,
    created_at: new Date().toISOString(),
  });
  return result.lastInsertRowid as number;
}

export function updateGroupTokenHash(groupId: number, tokenHash: string): void {
  _updateGroupTokenHash.run({ id: groupId, api_token_hash: tokenHash });
}

export function deleteGroup(groupId: number): void {
  _deleteGroup.run({ id: groupId });
}

export function deleteCohort(cohortId: number): void {
  _deleteCohort.run({ id: cohortId });
}

export function getGroupsByCohort(cohortId: number): Array<{ id: number; name: string; created_at: string }> {
  return _getGroupsByCohort.all({ cohort_id: cohortId });
}

export function getRunsByCohort(cohortId: number): RunWithGroupRow[] {
  return _getRunsByCohort.all({ cohort_id: cohortId });
}

export function insertSession(id: string, expiresAt: string): void {
  _insertSession.run({ id, expires_at: expiresAt, created_at: new Date().toISOString() });
}

export function getSession(id: string): AdminSessionRow | undefined {
  return _getSession.get({ id });
}

export function deleteSession(id: string): void {
  _deleteSession.run({ id });
}

export function deleteExpiredSessions(): void {
  _deleteExpiredSessions.run({ now: new Date().toISOString() });
}
