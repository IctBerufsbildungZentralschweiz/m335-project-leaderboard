/**
 * Test seed: creates a cohort + group, then POSTs two runs via HTTP.
 * Requires the dev server to be running: npm run dev
 *
 * Usage: npm run test-seed
 */
import { randomBytes, createHash } from 'node:crypto';
import { getCohortBySlug, insertCohort, insertGroup } from '../db.js';

const COHORT_SLUG = 'test-local';
const COHORT_NAME = 'Test Kohorte (lokal)';
const GROUP_NAME = 'Test Gruppe';
const BASE_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

// 1. Cohort — skip if already exists
let cohort = getCohortBySlug(COHORT_SLUG);
if (cohort) {
  console.log(`ℹ️  Cohort "${COHORT_SLUG}" already exists (id=${cohort.id}), reusing it.`);
} else {
  const id = insertCohort(COHORT_NAME, COHORT_SLUG);
  cohort = getCohortBySlug(COHORT_SLUG)!;
  console.log(`✅ Cohort created: "${COHORT_NAME}" (id=${id})`);
}

// 2. Group — always creates a fresh one so the token is known
const token = randomBytes(16).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const groupId = insertGroup(cohort.id, GROUP_NAME, tokenHash);
console.log(`✅ Group created: "${GROUP_NAME}" (id=${groupId})`);

// 3. Two test runs
const runs = [
  { playerName: 'Ada Lovelace',  schnitzel: 5, kartoffeln: 0, durationSeconds: 298 },
  { playerName: 'Grace Hopper',  schnitzel: 4, kartoffeln: 1, durationSeconds: 342 },
];

console.log('');
for (const run of runs) {
  const res = await fetch(`${BASE_URL}/api/${COHORT_SLUG}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Token': token,
    },
    body: JSON.stringify(run),
  });

  if (res.ok) {
    const data = await res.json() as { id: number };
    console.log(`✅ Run submitted: "${run.playerName}" (id=${data.id}, schnitzel=${run.schnitzel}, durationSeconds=${run.durationSeconds})`);
  } else {
    const err = await res.json() as { error: string };
    console.error(`❌ Run failed for "${run.playerName}": ${err.error}`);
    process.exit(1);
  }
}

console.log('');
console.log(`🏆  Leaderboard → ${BASE_URL}/leaderboard/${COHORT_SLUG}`);
console.log(`📋  JSON API    → ${BASE_URL}/api/${COHORT_SLUG}/leaderboard`);
