# Tasks

Task list for the Schnitzeljagd Leaderboard project.  
Derived from the phased implementation plan in [SPEC.md](SPEC.md).

---

## Phase 1 — Core (MVP)

- [ ] `tsconfig.json`, `package.json`, project scaffold
- [ ] `Dockerfile` + `docker-compose.yml` + `.env.example`
- [ ] SQLite setup (`db.ts`) with schema migrations
- [ ] `POST /api/:cohortSlug/runs` — submit a run (group token auth)
- [ ] `GET /api/:cohortSlug/leaderboard` — ranked results (public)
- [ ] Leaderboard HTML page with auto-refresh (every 30 s)
- [ ] Deploy to Synology NAS, verify end-to-end with a test run

## Phase 2 — Admin UX

- [ ] Session middleware — httpOnly cookie, `SESSION_SECRET`, 8 h TTL
- [ ] `POST /admin/login` + `POST /admin/logout`
- [ ] Admin login page (`/admin/login`)
- [ ] Admin REST routes — cohort CRUD
- [ ] Admin REST routes — group CRUD + token generation + token reset
- [ ] Admin dashboard UI — cohort & group management
- [ ] New-token modal (token shown once, copy button)
- [ ] `GET /admin/cohorts/:cohortId/runs` — run list for export/inspection
- [ ] Rate limiting (10 req/min per group token)
- [ ] Login brute-force lockout (5 failures → 60 s lockout)

## Phase 3 — Polish

- [ ] Landing page listing all cohorts with links to leaderboards
- [ ] Leaderboard medal styling (🥇🥈🥉) + responsive layout for beamer
- [ ] CSV export of runs per cohort (admin)
- [ ] `HH:mm:ss` duration helper used consistently across all views
- [ ] Backup documentation (Synology Hyper Backup setup)
- [ ] Student handout template (cohort slug + token instructions)
