# Schnitzeljagd Leaderboard — Technical Specification

> **Status:** Draft  
> **Author:** Instructor / M335  
> **Last updated:** 2026-05-27

---

## 1. Overview

A self-hosted leaderboard service for the M335 Schnitzeljagd module project.  
Students' apps submit a single POST request at the end of a run; the leaderboard
website displays all submissions in ranked order.

### Goals
| Goal | Notes |
|------|-------|
| Receive one POST per completed Schnitzeljagd run | Replaces Google Forms |
| Display a ranked leaderboard per cohort | Replaces Google Sheets |
| Support multiple course cohorts (semesters) | Data stays separated |
| Per-group API tokens | Prevents random submissions |
| Zero-maintenance self-hosting on Synology NAS | Docker + SQLite, no external DB |

### Non-goals
- No student login / authentication UI
- No real-time websocket updates (polling is fine)
- No result editing / deletion via API (admin does this directly in DB or via admin UI)

---

## 2. Concepts & Terminology

| Term | Description |
|------|-------------|
| **Cohort** | One offering of the course, e.g. *"M335 HS2025"*. Has its own leaderboard URL. |
| **Group** | A student group (2–3 people) within a cohort. Gets one API token. |
| **Run** | One completed (or aborted) Schnitzeljagd attempt by a player. |
| **Schnitzel 🥩** | Points earned — one per completed task. Higher = better. |
| **Kartoffel 🥔** | Penalty marker — awarded when a task took too long. Lower = better. |
| **Duration** | Wall-clock seconds from start to finish of the run. Lower = better. |

---

## 3. Data Model

```
┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
│   cohorts    │ 1──* │   groups     │ 1──* │      runs        │
├──────────────┤      ├──────────────┤      ├──────────────────┤
│ id           │      │ id           │      │ id               │
│ name         │      │ cohort_id FK │      │ cohort_id FK     │
│ slug         │      │ name         │      │ group_id FK      │
│ created_at   │      │ api_token    │      │ player_name      │
└──────────────┘      │ created_at   │      │ schnitzel        │
                      └──────────────┘      │ kartoffeln       │
                                            │ duration_seconds │
                                            │ submitted_at     │
                                            └──────────────────┘
```

### `cohorts`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Display name, e.g. *"M335 HS2025"* |
| `slug` | TEXT | NOT NULL UNIQUE | URL-safe, e.g. `m335-hs2025` |
| `created_at` | TEXT | NOT NULL | ISO 8601 UTC |

### `groups`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `cohort_id` | INTEGER | FK → cohorts.id | |
| `name` | TEXT | NOT NULL | e.g. *"Gruppe 3"* |
| `api_token` | TEXT | NOT NULL UNIQUE | 32-char hex, generated on creation |
| `created_at` | TEXT | NOT NULL | ISO 8601 UTC |

### `runs`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `cohort_id` | INTEGER | FK → cohorts.id | Denormalised for fast queries |
| `group_id` | INTEGER | FK → groups.id | |
| `player_name` | TEXT | NOT NULL | Free text from the app |
| `schnitzel` | INTEGER | NOT NULL, ≥ 0 | Completed tasks |
| `kartoffeln` | INTEGER | NOT NULL, ≥ 0 | Time-penalty markers |
| `duration_seconds` | INTEGER | NOT NULL, > 0 | Total run time |
| `submitted_at` | TEXT | NOT NULL | ISO 8601 UTC, set server-side |

---

## 4. Ranking Algorithm

Runs are sorted by these criteria **in order**:

1. `schnitzel` **DESC** — more completed tasks wins
2. `kartoffeln` **ASC** — fewer penalties wins
3. `duration_seconds` **ASC** — faster wins
4. `submitted_at` **ASC** — earlier submission wins (tiebreaker)

---

## 5. API Specification

Base URL: `https://<your-nas-domain>/api`

### 5.1 Authentication

Student app requests include the group token in a custom header:

```
X-API-Token: <group-api-token>
```

Admin endpoints use a separate `X-Admin-Token` header (a single secret set
via environment variable at startup).

> **Why a custom header instead of `Authorization: Bearer`?**  
> Ionic/Capacitor HTTP plugins handle custom headers more easily and it avoids
> any CORS preflight complications with `Authorization`.

---

### 5.2 Submit a Run (student app endpoint)

```
POST /api/:cohortSlug/runs
```

**Headers**
```
Content-Type: application/json
X-API-Token: <group-api-token>
```

**Path parameters**
| Param | Description |
|-------|-------------|
| `cohortSlug` | Slug of the current cohort, e.g. `m335-hs2025` |

**Request body**
```jsonc
{
  "playerName":        "Ada Lovelace",   // string, 1–80 chars
  "schnitzel":         4,                // integer, 0–10
  "kartoffeln":        1,                // integer, 0–10
  "durationSeconds":   342               // integer, 1–86400 (max 24 h)
}
```

**Responses**

| Status | Body | When |
|--------|------|------|
| `201 Created` | Run object (see below) | Success |
| `400 Bad Request` | `{ "error": "<message>" }` | Validation failed |
| `401 Unauthorized` | `{ "error": "Invalid or missing API token" }` | Wrong/missing token |
| `404 Not Found` | `{ "error": "Cohort not found" }` | Unknown slug |
| `429 Too Many Requests` | `{ "error": "Rate limit exceeded" }` | >10 req/min per token |

**201 response body**
```jsonc
{
  "id":              42,
  "playerName":      "Ada Lovelace",
  "groupName":       "Gruppe 3",
  "schnitzel":       4,
  "kartoffeln":      1,
  "durationSeconds": 342,
  "submittedAt":     "2025-11-14T09:12:34Z"
}
```

---

### 5.3 Get Leaderboard (public, no auth)

```
GET /api/:cohortSlug/leaderboard
```

**Query parameters**
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `100` | Max rows returned |

**200 response body**
```jsonc
{
  "cohort": {
    "name": "M335 HS2025",
    "slug": "m335-hs2025"
  },
  "updatedAt": "2025-11-14T09:12:34Z",
  "entries": [
    {
      "rank":            1,
      "playerName":      "Ada Lovelace",
      "groupName":       "Gruppe 3",
      "schnitzel":       5,
      "kartoffeln":      0,
      "durationSeconds": 298,
      "submittedAt":     "2025-11-14T09:12:34Z"
    }
    // ...
  ]
}
```

---

### 5.4 Admin Endpoints

All admin API routes (except login/logout) require a valid **session cookie**
(`admin_session`) set by the login endpoint. Requests without a valid session
receive `401 Unauthorized`.

#### Login
```
POST /admin/login
```
Body: `{ "password": "<ADMIN_PASSWORD>" }`

| Status | When |
|--------|------|
| `204 No Content` + sets `admin_session` cookie | Correct password |
| `401 Unauthorized` | Wrong password |

#### Logout
```
POST /admin/logout
```
Clears the `admin_session` cookie and invalidates the server-side session.  
Response: `204 No Content`.

---

#### Create a cohort
```
POST /admin/cohorts
```
Body: `{ "name": "M335 HS2025", "slug": "m335-hs2025" }`  
Response `201`: cohort object.

#### List cohorts
```
GET /admin/cohorts
```
Response `200`: array of cohort objects.

#### Create a group (generates API token)
```
POST /admin/cohorts/:cohortId/groups
```
Body: `{ "name": "Gruppe 1" }`  
Response `201`:
```jsonc
{
  "id":       7,
  "name":     "Gruppe 1",
  "apiToken": "a3f8c2...d910",   // show ONCE, store securely
  "cohortId": 1
}
```
> ⚠️ The `apiToken` is returned **once** on creation. Store it or hand it to the
> group immediately; the API will not expose it again (only a hash is kept in DB).

#### List groups for a cohort
```
GET /admin/cohorts/:cohortId/groups
```
Returns groups **without** their tokens (tokens are hashed in DB).

#### Reset a group token
```
POST /admin/groups/:groupId/reset-token
```
Generates and returns a new token (old token is invalidated).

#### List all runs for a cohort
```
GET /admin/cohorts/:cohortId/runs
```
Full run list with group info, for export/inspection.

---

## 6. Frontend — Leaderboard Website

A single-page, server-rendered or static HTML page served by the same Node.js
process.

### Routes

| Path | Description |
|------|-------------|
| `/` | Landing page — list of all cohorts, link to each leaderboard |
| `/leaderboard/:cohortSlug` | Live leaderboard for that cohort |
| `/admin/login` | Admin login page (public) |
| `/admin/logout` | Clears session, redirects to `/admin/login` |
| `/admin` | Admin dashboard — redirects to `/admin/login` if not authenticated |

### Leaderboard page layout

```
┌─────────────────────────────────────────────────┐
│  🥩 Schnitzeljagd Leaderboard                   │
│  M335 HS2025                                     │
├──────┬────────────────┬─────────┬────────┬──────┤
│ Rank │ Player         │ 🥩      │ 🥔     │ Time │
├──────┼────────────────┼─────────┼────────┼──────┤
│  🥇  │ Ada Lovelace   │  5      │  0     │ 00:04:58 │
│  🥈  │ Grace Hopper   │  5      │  0     │ 00:05:22 │
│  🥉  │ Alan Turing    │  4      │  1     │ 00:03:40 │
│   4  │ ...            │  ...    │  ...   │ ...  │
└──────┴────────────────┴─────────┴────────┴──────┘
         Last updated: 09:12:34  [↻ Refresh]
```

- **Auto-refresh** every 30 seconds via `setInterval` + `fetch`
- Duration displayed as `HH:mm:ss` (e.g. `00:05:42`)
- Top 3 show medal emojis instead of numbers
- Group name shown in a subtitle/tooltip (not primary rank column — multiple
  players per group can submit)
- Responsive — works on a beamer / classroom screen

### Admin UI (simple, no framework needed)

#### Login page (`/admin/login`)

```
┌──────────────────────────────────┐
│   🥩 Leaderboard Admin           │
│                                  │
│   Password  [________________]   │
│             [    Sign in     ]   │
│                                  │
│   (error message if wrong)       │
└──────────────────────────────────┘
```

- Single password field (no username — there is only one admin)
- POSTs `{ password }` to `POST /admin/login`
- On success: server sets an **httpOnly session cookie** (`admin_session`),
  redirects to `/admin`
- On failure: shows inline error, stays on login page
- All admin pages redirect to `/admin/login` if the cookie is absent or expired

#### Session management
- Session stored server-side (in-memory Map or SQLite `sessions` table)
- Cookie: `httpOnly`, `sameSite=strict`, `secure` (via HTTPS reverse proxy)
- Session lifetime: **8 hours** (configurable via `ADMIN_SESSION_TTL_HOURS` env)
- `POST /admin/logout` clears the cookie and invalidates the server-side session

#### Main admin dashboard (`/admin`)

- Sidebar / tab list of cohorts
- Per-cohort view:
  - **Groups** tab: list groups, add group (token shown **once** in a modal),
    reset token button (new token shown once in modal)
  - **Runs** tab: paginated list of all runs for the cohort (read-only)
  - **"Copy leaderboard URL"** button

#### New-token modal
```
┌──────────────────────────────────────────────────┐
│  ✅ Token for "Gruppe 3"                          │
│                                                  │
│  a3f8c2d1...9e10                  [📋 Copy]      │
│                                                  │
│  ⚠️ This token will not be shown again.          │
│  Copy it now and hand it to the group.           │
│                                  [  Close  ]     │
└──────────────────────────────────────────────────┘
```

---

## 7. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js 22 LTS | Stable, good TS support |
| Language | TypeScript | Type safety, matches students' stack |
| Web framework | **Fastify** | Fast, built-in JSON schema validation, good TS types |
| Database | **SQLite** via `better-sqlite3` | Zero-ops, single file, perfect for NAS volume |
| Token storage | SHA-256 hash of token in DB | Tokens never stored in plain text after creation |
| Frontend | Vanilla HTML/CSS/JS (no framework) | Zero build step, easy to maintain |
| Container | Docker (Node 22 Alpine) | Easy Synology Container Manager deployment |
| Process manager | Docker restart policy | No PM2 needed inside container |

### Why Fastify over Express?
- Built-in JSON schema validation (no extra library) → cleaner route definitions
- Slightly faster, better TypeScript support out of the box

### Why SQLite over Postgres?
- No second container to manage
- Data is a single `.db` file → trivial backup on NAS
- Write volume is low (one INSERT per student run)

---

## 8. Project Structure

```
leaderboard/
├── src/
│   ├── server.ts          # Fastify instance, plugin registration, startup
│   ├── db.ts              # better-sqlite3 setup, migrations
│   ├── routes/
│   │   ├── public.ts      # POST /:cohortSlug/runs, GET /:cohortSlug/leaderboard
│   │   ├── admin.ts       # All /admin/* routes (protected)
│   │   └── auth.ts        # POST /admin/login, POST /admin/logout
│   ├── plugins/
│   │   ├── groupAuth.ts   # X-API-Token validation for student endpoints
│   │   └── session.ts     # httpOnly cookie session middleware for admin
│   └── types.ts           # Shared TS interfaces
├── public/
│   ├── index.html         # Cohort landing page
│   ├── leaderboard.html   # Leaderboard (fetches /api/:slug/leaderboard)
│   ├── admin/
│   │   ├── login.html     # Login form
│   │   └── index.html     # Admin dashboard (redirects to login if no session)
│   └── style.css
├── Dockerfile
├── docker-compose.yml
├── .env.example           # committed — template with placeholder values, no secrets
├── .env                   # gitignored — actual secrets, filled in on the NAS
├── package.json
└── tsconfig.json
```

---

## 9. Docker & Deployment

### Dockerfile (sketch)
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build          # tsc → dist/
RUN npm prune --production
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### docker-compose.yml
```yaml
services:
  leaderboard:
    build: .                                        # builds from the Dockerfile in the repo
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /volume1/docker/leaderboard/data:/app/data  # SQLite file lives here
    environment:
      - ADMIN_PASSWORD=change-me-before-deploy      # min 16 chars
      - SESSION_SECRET=change-me-random-32-chars    # generate with: openssl rand -hex 32
      - DATABASE_PATH=/app/data/leaderboard.db
      - PORT=3000
      # - ADMIN_SESSION_TTL_HOURS=8                 # optional, default 8
```

> **No image registry needed.** `docker compose up --build` builds the image
> directly from the cloned repo on the NAS. Re-run the same command after a
> `git pull` to pick up changes.

### Synology setup steps (summary)
1. SSH into the NAS and clone the repo:
   ```bash
   git clone <repo-url> /volume1/docker/leaderboard/repo
   ```
2. Create the data directory for the SQLite file:
   ```bash
   mkdir -p /volume1/docker/leaderboard/data
   ```
3. Copy and fill in the environment variables:
   ```bash
   cp /volume1/docker/leaderboard/repo/.env.example \
      /volume1/docker/leaderboard/repo/.env
   # edit .env with your ADMIN_PASSWORD and SESSION_SECRET
   ```
4. Build and start:
   ```bash
   cd /volume1/docker/leaderboard/repo
   docker compose up -d --build
   ```
5. Add a **Reverse Proxy** rule in DSM Control Panel:  
   `https://leaderboard.yourdomain.com` → `localhost:3000`
6. Point your domain to the NAS (DynDNS or static IP)

### Updating to a new version
```bash
cd /volume1/docker/leaderboard/repo
git pull
docker compose up -d --build
```
Docker Compose rebuilds only if the Dockerfile or source files changed.

---

## 10. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP listen port |
| `DATABASE_PATH` | No | `./data/leaderboard.db` | Path to SQLite file |
| `ADMIN_PASSWORD` | **Yes** | — | Admin login password (min 16 chars) |
| `SESSION_SECRET` | **Yes** | — | Secret used to sign session IDs (min 32 chars, random) |
| `ADMIN_SESSION_TTL_HOURS` | No | `8` | How long admin sessions stay valid |
| `RATE_LIMIT_MAX` | No | `10` | Max requests per minute per group token |

---

## 11. Student App Integration

The students need to make exactly **one HTTP POST** call at the end of a run.
Here is the contract they receive:

```
POST https://leaderboard.yourdomain.com/api/m335-hs2025/runs

Headers:
  Content-Type:  application/json
  X-API-Token:   <your-group-token>

Body:
{
  "playerName":      "<name entered at start>",
  "schnitzel":       <number of completed tasks>,
  "kartoffeln":      <number of time-penalty markers>,
  "durationSeconds": <total seconds from start to finish>
}
```

A `201` response means success. Any other status means something went wrong —
the app should show a friendly error (not crash).

### Notes for the student handout
- The **cohort slug** and **group API token** are given out by the instructor on
  the day of the Schnitzeljagd.
- Tokens are group-specific — don't share across groups.
- The endpoint is idempotent in practice (submitting twice just adds a second row),
  so a retry on network error is fine.
- Use `@capacitor/http` or Angular `HttpClient` — either works.

---

## 12. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Spam submissions | Per-group token required; rate-limited to 10/min per token |
| Group token exposure | Stored as SHA-256 hash in DB; returned plain-text only at creation |
| Admin password brute-force | Constant-time comparison (`crypto.timingSafeEqual`); 5 failed logins → 60s lockout |
| Admin session hijacking | httpOnly + sameSite=strict cookie; `SESSION_SECRET` never in source |
| Admin session fixation | New session ID issued on every successful login |
| SQL injection | `better-sqlite3` parameterised queries throughout |
| XSS in player names | Output-escaped in all HTML templates |
| HTTPS | Handled by Synology reverse proxy (Let's Encrypt) |

---

## 13. Open Questions / Decisions

- [ ] **Cohort slug format** — e.g. `m335-hs2025`, `m335-fs2026`? Instructor decides
      naming convention before first deploy.
- [x] **Run limit per group** — **no cap**; unlimited runs allowed per group.
- [x] **Admin UI auth** — **login screen** with password + httpOnly session cookie
      (see §5.4 and §6 Admin UI).
- [x] **Backup strategy** — out of scope for this project; handle via NAS-level Hyper Backup if needed.
- [x] **Duration display format** — **`HH:mm:ss`** (e.g. `00:05:42`).

---

## 14. Phased Implementation Plan

### Phase 1 — Core (MVP for first Schnitzeljagd)
1. SQLite schema + migrations
2. `POST /:cohortSlug/runs` with token auth
3. `GET /:cohortSlug/leaderboard`
4. Basic leaderboard HTML page (auto-refresh)
5. Docker image + Synology deploy

### Phase 2 — Admin UX
6. Session middleware (`SESSION_SECRET`, httpOnly cookie, 8 h TTL)
7. `POST /admin/login` + `POST /admin/logout` + login page
8. Admin REST routes (cohort/group CRUD, token reset)
9. Admin dashboard UI (cohort/group management, token modal)
10. Rate limiting + login lockout

### Phase 3 — Polish
11. Landing page with cohort list
12. Leaderboard medal styling + beamer-responsive layout
13. Shared client-side duration formatter (`public/format.js`)
