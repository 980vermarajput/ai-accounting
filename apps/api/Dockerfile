# ── Stage 1: Base ─────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── Stage 2: Install dependencies ────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ── Stage 3: Build ───────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @ai-accounting/shared build
RUN pnpm --filter @ai-accounting/api build

# ── Stage 4: Production ──────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./node_modules/@ai-accounting/shared/dist
COPY --from=build /app/packages/shared/package.json ./node_modules/@ai-accounting/shared/

EXPOSE 4000
CMD ["node", "dist/index.js"]
