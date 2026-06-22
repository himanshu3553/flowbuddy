# Sync Studio (Next.js). pnpm monorepo. Build context = repo root.
FROM node:22-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sync/db generate
# Pages are force-dynamic, so the build needs no DB — only the generated Prisma client.
RUN pnpm --filter @sync/web build

ENV NODE_ENV=production
EXPOSE 3000

# `next start` listens on $PORT (Render provides it).
CMD ["pnpm", "--filter", "@sync/web", "start"]
