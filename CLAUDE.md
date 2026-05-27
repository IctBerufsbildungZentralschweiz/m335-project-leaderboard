# CLAUDE.md

> **Keep this file up to date.** Whenever the project structure, stack, commands,
> or conventions change, update the relevant section here so the next session
> starts with accurate context.

---

## Start Here (new session orientation)

- **Phase 1 is complete** — `src/`, `public/`, `package.json`, `Dockerfile`, `docker-compose.yml` all exist. Next: NAS deploy, then Phase 2 (admin UX).
- Check [`docs/TASKS.md`](docs/TASKS.md) for remaining work.
- All work goes on the **`develop`** branch; `main` is production-only.
- Read the rest of this file before writing any code.

---

## Project

Self-hosted leaderboard for the **M335 Schnitzeljagd** mobile-dev course.  
Students' Ionic/Angular apps POST a result at the end of a run; instructors see
a ranked leaderboard per cohort (semester).

Full specification: [`docs/SPEC.md`](docs/SPEC.md)  
Task list: [`docs/TASKS.md`](docs/TASKS.md)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22 LTS |
| Language | TypeScript |
| Web framework | Fastify |
| Database | SQLite via `better-sqlite3` |
| Frontend | Vanilla HTML / CSS / JS (no build step) |
| Container | Docker — built from repo via `docker compose up --build` |
| Hosting | Synology NAS (Container Manager + reverse proxy) |

---

## Project Structure

```
leaderboard/
├── docs/
│   ├── SPEC.md            # Full specification
│   └── TASKS.md           # Phased task list
├── src/
│   ├── server.ts          # Fastify instance, plugin registration, startup
│   ├── db.ts              # better-sqlite3 setup and migrations
│   ├── routes/
│   │   ├── public.ts      # Student-facing API endpoints
│   │   ├── admin.ts       # Admin API endpoints (session-protected)
│   │   └── auth.ts        # POST /admin/login, POST /admin/logout
│   ├── plugins/
│   │   ├── groupAuth.ts   # X-API-Token validation for student endpoints
│   │   └── session.ts     # httpOnly cookie session middleware for admin
│   └── types.ts           # Shared TypeScript interfaces
├── public/
│   ├── index.html         # Cohort landing page
│   ├── leaderboard.html   # Public leaderboard (auto-refresh)
│   ├── admin/
│   │   ├── login.html     # Admin login form
│   │   └── index.html     # Admin dashboard
│   └── style.css
├── Dockerfile
├── docker-compose.yml
├── .env.example           # Committed — template with placeholder values
├── .env                   # Gitignored — real secrets, lives only on the NAS
├── package.json
├── tsconfig.json
└── CLAUDE.md              # ← this file
```

> **Note:** `src/cli/seed.ts` and `src/ranking.ts` / `src/time.ts` are additional Phase 1 files not listed above. `public/admin/` does not exist yet (Phase 2).

---

## Key Commands

```bash
# Install dependencies
npm install

# Development (ts-node with watch)
npm run dev

# Build (tsc → dist/)
npm run build

# Start built output
npm start

# Build & start via Docker Compose (what the NAS runs)
docker compose up --build -d

# Rebuild after git pull on NAS
git pull && docker compose up --build -d
```

> Update this section when scripts are added to `package.json`.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP listen port |
| `DATABASE_PATH` | No | `./data/leaderboard.db` | Path to SQLite file |
| `ADMIN_PASSWORD` | **Yes** | — | Admin login password (min 16 chars) |
| `SESSION_SECRET` | **Yes** | — | Signs session IDs — generate with `openssl rand -hex 32` |
| `ADMIN_SESSION_TTL_HOURS` | No | `8` | Admin session lifetime |
| `RATE_LIMIT_MAX` | No | `10` | Max API requests per minute per group token |

---

## API at a Glance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/:cohortSlug/runs` | `X-API-Token` (group) | Submit a run |
| `GET` | `/api/:cohortSlug/leaderboard` | None | Ranked results |
| `POST` | `/admin/login` | — | Start admin session |
| `POST` | `/admin/logout` | Session cookie | End admin session |
| `POST` | `/admin/cohorts` | Session cookie | Create cohort |
| `POST` | `/admin/cohorts/:id/groups` | Session cookie | Create group (returns token once) |
| `POST` | `/admin/groups/:id/reset-token` | Session cookie | Regenerate group token |

---

## Git Workflow

| Branch | Purpose |
|--------|---------|
| `main` | Production — only what runs on the NAS. Never commit directly. |
| `develop` | Integration branch — all day-to-day work happens here. |

```bash
# Standard flow
git checkout develop        # always work here
git add … && git commit …
git push origin develop

# Deploy to production
git checkout main
git merge develop
git push origin main
git checkout develop
```

- Commit messages in English, imperative mood ("Add login route", not "Added…").
- Keep `develop` passing (buildable + no TS errors) before merging to `main`.
- There is no separate PR process for this solo project — direct merges are fine.

---

## Conventions

- **Duration** is stored as integer seconds in the DB; displayed as `HH:mm:ss` everywhere in the UI.
- **Group tokens** are stored as SHA-256 hashes — returned plain-text only at creation or reset.
- **Ranking order:** `schnitzel DESC → kartoffeln ASC → duration_seconds ASC → submitted_at ASC`
- All HTML output escapes user-supplied strings to prevent XSS.
- Parameterised queries only — no string interpolation into SQL.
