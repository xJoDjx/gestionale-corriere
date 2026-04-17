# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gestionale Corriere** is a full-stack courier fleet management system. It handles vehicle fleet tracking, contractor (padroncino) management, monthly billing (conteggi), mobile device assignments, and audit logging.

## Development Setup

### Prerequisites
- Docker (for PostgreSQL)
- Node.js

### Start Development Environment

```bash
# 1. Start database
docker-compose up -d

# 2. Backend (runs on http://localhost:3000, Swagger at /api/docs)
cd backend
npm install
npx prisma db push     # sync schema (use migrate:dev for migrations)
npm run start:dev

# 3. Frontend (runs on http://localhost:5173)
cd frontend
npm install
npm run dev
```

### Backend Commands
```bash
cd backend
npm run start:dev       # watch mode
npm run build           # production build
npm run db:generate     # regenerate Prisma client after schema changes
npm run db:push         # sync schema to DB without migration
npm run db:migrate      # create and apply a migration
npm run db:seed         # seed the database
```

### Frontend Commands
```bash
cd frontend
npm run dev             # dev server
npm run build           # TypeScript check + Vite build
npm run preview         # preview production build
```

### Default Credentials
- Email: `admin@gestionale.it`
- Password: `admin123`

## Architecture

### Stack
- **Backend**: NestJS 10 (TypeScript), Prisma 5, PostgreSQL
- **Frontend**: React 18 + Vite, Zustand, React Router 6, plain CSS
- **Auth**: JWT + Passport.js, bcrypt
- **Extras**: jsPDF (PDF export), xlsx (Excel import), Swagger (API docs)

### Monorepo Layout
```
gestionale-corriere/
├── backend/       # NestJS API
├── frontend/      # React SPA
├── prisma/        # DB schema & seed (canonical)
└── docker-compose.yml
```

The `prisma/schema.prisma` at the root is canonical; `backend/prisma/schema.prisma` is a copy used by NestJS.

### Backend Structure

Each feature module follows this pattern:
```
backend/src/{feature}/
├── {feature}.controller.ts   # HTTP route handlers
├── {feature}.service.ts      # Business logic + Prisma queries
├── {feature}.dto.ts          # Request/response DTOs (class-validator)
└── {feature}.module.ts
```

**Auth & Authorization**: JWT strategy validates Bearer tokens and enriches `req.user`. Two guards are applied globally:
- `RolesGuard` — ADMIN / OPERATORE / VIEWER roles
- `PermissionsGuard` — granular per-resource actions (admins bypass all checks)

**PrismaService** (extends `PrismaClient`) provides:
- `softDeleteFilter()` → `{ deletedAt: null }`
- `activeAssignmentFilter(date)` → date range overlap check

### Frontend Structure

```
frontend/src/
├── features/{resource}/      # Feature pages + CSS
├── components/layout/        # Sidebar + Layout wrapper
├── components/ui/            # Shared UI components
├── lib/api.ts                # Central API client
└── stores/                   # Zustand stores (auth, theme)
```

**API client** (`lib/api.ts`): A thin fetch wrapper with typed helpers (`api.get`, `api.post`, etc.). Each feature exports a typed API object (e.g., `mezziApi`, `padronciniApi`). The JWT token is stored in Zustand + localStorage but must be manually attached to requests — the wrapper does not auto-inject the `Authorization` header.

**State**: Only auth (user + token) and theme (light/dark) are global Zustand state. All other state is local component state.

**Styling**: Pure CSS with custom properties defined in `styles/global.css`. No CSS frameworks, no preprocessors.

### Database Design Patterns

- **Soft delete**: All entities have `deletedAt: DateTime?`. Always filter `where: { deletedAt: null }` in queries. Use `findFirst` (not `findUnique`) when re-inserting previously soft-deleted records by unique field.
- **Audit log**: Every CREATE/UPDATE/DELETE is recorded in `AuditLog` (entityType, entityId, azione, dataPrima, dataDopo JSON, userId).
- **Temporal assignments**: `AssegnazioneMezzo`, `AssegnazionePalmare`, `AssegnazioneCodiceAutista` use `dataInizio`/`dataFine`. Opening a new assignment auto-closes the previous active one.
- **Billing rows** (`ConteggiRiga`): Polymorphic line items with `tipo` (FATTURATO, NOLEGGIO, RICARICA, ACCONTO, ALTRO), `segno` (DARE/AVERE), and optional `riferimentoId`.

### Key Business Entities

| Entity | Purpose |
|--------|---------|
| `Mezzo` | Fleet vehicle with rental fields, document deadlines, assignments |
| `Padroncino` | Owner/contractor company (DURC/DVR deadlines) |
| `Palmare` | Mobile device terminal |
| `CodiceAutista` | Driver code linked to a padroncino |
| `ConteggioMensile` | Monthly billing summary per padroncino |
| `ConteggiRiga` | Individual billing line items |
| `Documento` | Polymorphic file attachment with optional expiry |

### Environment Variables

Backend (`.env`):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gestionale_corriere?schema=public
JWT_SECRET=your-secret
FRONTEND_URL=http://localhost:5173
PORT=3000
```

Frontend (`.env`):
```
VITE_API_URL=http://localhost:3000/api
```
