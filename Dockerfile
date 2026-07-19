# Container image for the content-management-dashboard control-plane (Next.js, pnpm monorepo).
# Built from the repo root so the workspace packages are present.
FROM node:22-slim

# Prisma + native render libs need openssl/ca-certs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

# NEXT_PUBLIC_* must exist at build time (baked into the client bundle).
ARG NEXT_PUBLIC_DISABLE_AUTH=true
ENV NEXT_PUBLIC_DISABLE_AUTH=$NEXT_PUBLIC_DISABLE_AUTH

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @cmd/db exec prisma generate
RUN pnpm --filter @cmd/control-plane build

ENV NODE_ENV=production
# Railway injects $PORT; default to 3001 for local runs.
EXPOSE 3001
CMD pnpm --filter @cmd/control-plane exec next start --port ${PORT:-3001}
