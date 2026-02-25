# AI Assistant for Accountants

A lightweight, secure AI assistant for Indian chartered accountants — indexes Gmail, Google Drive, and client spreadsheets; answers questions via RAG with source citations; and drafts professional client emails.

## Tech Stack

| Layer         | Technology                                   |
| ------------- | -------------------------------------------- |
| Frontend      | Next.js 14 (App Router), Tailwind CSS        |
| Backend       | Node.js 20, Express.js, TypeScript           |
| Database      | PostgreSQL 16 + pgvector                     |
| Cache / Queue | Redis 7, BullMQ                              |
| AI            | OpenAI (GPT-4o-mini, text-embedding-3-small) |
| Infra         | Docker, AWS (Mumbai)                         |

## Repo Structure

```
ai-accounting/
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Shared TypeScript types
├── docker-compose.yml         # Full stack (all services)
├── docker-compose.dev.yml     # Dev infra only (Postgres + Redis)
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Docker** & **Docker Compose**

### Option 1 — Run everything in Docker

```bash
# Build and start all services (Postgres, Redis, API, Web)
docker compose up --build
```

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000](http://localhost:4000)
- Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

### Option 2 — Local dev with hot reload (recommended)

```bash
# 1. Start infra (Postgres + Redis)
docker compose -f docker-compose.dev.yml up -d

# 2. Install dependencies
pnpm install

# 3. Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Start dev servers (API on :4000, Web on :3000)
pnpm dev
```

### Stop everything

```bash
docker compose down        # full stack
docker compose -f docker-compose.dev.yml down  # dev infra
```

## Environment Variables

See `apps/api/.env.example` and `apps/web/.env.example` for all required vars.

## License

Private — All rights reserved.
