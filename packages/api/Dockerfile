# FlowBuddy API (+ worker via command override). pnpm monorepo; the api/worker run TS via tsx.
# Build context = repo root (see render.yaml dockerContext: .).
FROM node:22-slim

# openssl is required by Prisma on slim images.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

# Install the whole workspace (reliable for a TS-source monorepo). .dockerignore keeps it lean.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @flowbuddy/db generate

ENV NODE_ENV=production
EXPOSE 8787

# API web service. The worker reuses this image with: pnpm --filter @flowbuddy/api worker
CMD ["pnpm", "--filter", "@flowbuddy/api", "start"]
