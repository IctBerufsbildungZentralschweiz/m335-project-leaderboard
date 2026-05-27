# Tasks

Task list for the Schnitzeljagd Leaderboard project.  
Derived from the phased implementation plan in [SPEC.md](SPEC.md).

---

## Phase 1 — Core (MVP)

- [x] `tsconfig.json`, `package.json`, project scaffold
- [x] `Dockerfile` + `docker-compose.yml` + `.env.example`
- [x] SQLite setup (`db.ts`) with schema migrations
- [x] `POST /api/:cohortSlug/runs` — submit a run (group token auth)
- [x] `GET /api/:cohortSlug/leaderboard` — ranked results (public)
- [x] Leaderboard HTML page with auto-refresh (every 30 s)
- [x] Cohort/group seed CLI (`npm run seed -- create-cohort / create-group`)
- [x] Landing page at `/` listing all cohorts
- [ ] Deploy to Synology NAS, verify end-to-end with a test run

## Phase 2 — Admin UX

- [x] Session middleware — httpOnly cookie, `SESSION_SECRET`, 8 h TTL
- [x] `POST /admin/login` + `POST /admin/logout`
- [x] Admin login page (`/admin/login`)
- [x] Admin REST routes — cohort CRUD (+ DELETE with FK-conflict 409)
- [x] Admin REST routes — group CRUD + token generation + token reset (+ DELETE)
- [x] Admin dashboard UI — cohort & group management
- [x] New-token modal (token shown once, copy button)
- [x] `GET /admin/cohorts/:cohortId/runs` — run list for export/inspection
- [x] Rate limiting (10 req/min per group token)
- [x] Login brute-force lockout (5 failures → 60 s lockout)

## Phase 3 — Polish

- [ ] Landing page listing all cohorts with links to leaderboards
- [ ] Leaderboard medal styling (🥇🥈🥉) + responsive layout for beamer
- [ ] CSV export of runs per cohort (admin)
- [ ] `HH:mm:ss` duration helper used consistently across all views
- [ ] Backup documentation (Synology Hyper Backup setup)
- [x] Student handout template (cohort slug + token instructions) — printable `/admin/handout` page, opened from token modal
