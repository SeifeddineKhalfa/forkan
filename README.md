# Forkan — منظومة الجمعية القرآنية بسليمان الفرقان

Management app for the Quranic association of Soliman: students, imla'at (classes),
fees and memberships, receipts, attendance and hifz tracking, plus a public news site.

- **Specification and build plan:** [docs/SPEC.md](docs/SPEC.md) (Part A = spec, Part B = slices)
- **Status:** Slices 0–7 done, plus the «رَقّ» UI theme, «المصحف المعلّم» and exams & competitions; next is Slice 8
  (production hardening) — see [docs/PROGRESS.md](docs/PROGRESS.md)
- **Modules guide:** [docs/MODULES.md](docs/MODULES.md) · **UI guide:** [docs/UI-GUIDE.md](docs/UI-GUIDE.md) ·
  **المصحف المعلّم:** [docs/MUSHAF-MUALLIM.md](docs/MUSHAF-MUALLIM.md)

## Stack

| Part | Tech |
|---|---|
| Backend | NestJS 12 (ESM), Prisma 7 + PostgreSQL 18, Zod, argon2, JWT in httpOnly cookies, pino |
| Frontend | Next.js 16 (App Router, Cache Components), React 19, Tailwind 4, shadcn/ui (RTL), next-intl, TanStack Query |
| Services | Docker Compose: Postgres 18, Gotenberg 8 (Arabic PDFs) |
| Tests | Vitest (unit + e2e on a real Postgres), oxlint, ESLint |

## Run it locally (Windows / macOS / Linux)

Prerequisites: Node.js 22+, Docker Desktop.

```bash
docker compose -f compose.dev.yml up -d
```

```bash
cd backend && cp .env.example .env && npm install && npx prisma migrate deploy && npm run db:seed
```

```bash
cd backend && npm run start:dev
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 and log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
from `backend/.env`. You will be asked to choose a new password on first login.

The backend and frontend run on the host (fast reloads on Windows); Docker only runs
Postgres (host port **5433**) and Gotenberg (**3002**). The frontend proxies `/api/*` to
the backend on port 3001, so the browser talks to a single origin, as it will behind
Caddy in production. Swagger is at http://localhost:3001/api/docs in development.

## Tests and checks

```bash
cd backend && npm run typecheck && npm test && npm run test:e2e
```

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

The e2e suite creates and empties a separate `forkan_test` database in the dev Postgres.

## Conventions

- Services query through `prisma.forSchool(schoolId)`; `schoolId` comes only from the
  logged-in user. `src/prisma/tenant-scope.spec.ts` fails if a model is left unscoped.
- The API returns error **codes** (`{ code: "INVALID_CREDENTIALS" }`); the frontend
  translates them from `frontend/messages/ar.json` → `errors.*`.
- Every mutating request needs the `X-Requested-With` header (CSRF defence); `src/lib/api.ts` adds it.
- UI strings live in `messages/ar.json`; use logical Tailwind utilities (`ms-`, `pe-`, `start-`).
- Next.js 16 changed a lot: read `frontend/node_modules/next/dist/docs/` before relying on
  older habits (e.g. `middleware.ts` is now `src/proxy.ts`).
- npm installs use `legacy-peer-deps` (see `.npmrc`) because of an npm 10 resolver crash
  with Vitest's optional peers; `npm ls` reports no real conflicts.
