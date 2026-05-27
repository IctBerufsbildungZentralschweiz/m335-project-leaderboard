import { randomBytes, createHash } from 'node:crypto';
import { getCohortBySlug, insertCohort, insertGroup } from '../db.js';

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const [, , command, ...rest] = process.argv;
const args = parseArgs(rest);

if (command === 'create-cohort') {
  const { name, slug } = args;
  if (!name) die('--name is required');
  if (!slug) die('--slug is required');
  if (!/^[a-z0-9-]+$/.test(slug)) die('--slug must be lowercase alphanumeric with hyphens only');

  const existing = getCohortBySlug(slug);
  if (existing) die(`Cohort with slug "${slug}" already exists (id=${existing.id})`);

  const id = insertCohort(name, slug);
  console.log(`✅ Cohort created: "${name}" (slug=${slug}, id=${id})`);

} else if (command === 'create-group') {
  const { cohort, name } = args;
  if (!cohort) die('--cohort <slug> is required');
  if (!name) die('--name is required');

  const cohortRow = getCohortBySlug(cohort);
  if (!cohortRow) die(`Cohort "${cohort}" not found`);

  const token = randomBytes(16).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const id = insertGroup(cohortRow.id, name, tokenHash);

  console.log(`✅ Group created: "${name}" in cohort "${cohort}" (id=${id})`);
  console.log('');
  console.log('API Token (shown once — copy and hand to the group now):');
  console.log('');
  console.log(`  ${token}`);
  console.log('');
  console.log('⚠️  This token will NOT be shown again.');

} else {
  console.error('Usage:');
  console.error('  npm run seed -- create-cohort --name "M335 HS2025" --slug m335-hs2025');
  console.error('  npm run seed -- create-group  --cohort m335-hs2025 --name "Gruppe 1"');
  process.exit(1);
}
