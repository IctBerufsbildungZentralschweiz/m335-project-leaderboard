import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CohortRow, GroupRow, LeaderboardRow } from './types.js';

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

// --- prepared statements ---
const _getCohortBySlug = db.prepare<{ slug: string }, CohortRow>(
  'SELECT id, name, slug, created_at FROM cohorts WHERE slug = :slug'
);

const _getGroupByTokenHash = db.prepare<{ hash: string; cohort_id: number }, GroupRow>(
  'SELECT id, name, cohort_id FROM groups WHERE api_token_hash = :hash AND cohort_id = :cohort_id'
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

const _getAllCohorts = db.prepare('SELECT id, name, slug FROM cohorts ORDER BY created_at DESC');

const _insertCohort = db.prepare<{ name: string; slug: string; created_at: string }>(
  'INSERT INTO cohorts (name, slug, created_at) VALUES (:name, :slug, :created_at)'
);

const _insertGroup = db.prepare<{ cohort_id: number; name: string; api_token_hash: string; created_at: string }>(
  'INSERT INTO groups (cohort_id, name, api_token_hash, created_at) VALUES (:cohort_id, :name, :api_token_hash, :created_at)'
);

// --- typed query helpers ---

export function getCohortBySlug(slug: string): CohortRow | undefined {
  return _getCohortBySlug.get({ slug });
}

export function getGroupByTokenHash(hash: string, cohortId: number): GroupRow | undefined {
  return _getGroupByTokenHash.get({ hash, cohort_id: cohortId });
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

export function getAllCohorts(): Array<{ id: number; name: string; slug: string }> {
  return _getAllCohorts.all() as Array<{ id: number; name: string; slug: string }>;
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
