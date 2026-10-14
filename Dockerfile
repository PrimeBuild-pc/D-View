FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS source
RUN npm install --global pnpm@11.9.0
COPY . .
# No runtime credentials or database connection are needed to generate/build.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm install --frozen-lockfile

FROM source AS schema
ENV HOME=/tmp
USER node
# Client generation already happened at build time; keep this one-shot job read-only.
CMD ["pnpm", "--filter", "@dpd/database", "db:push", "--skip-generate"]

FROM source AS build
RUN DPD_ENV_FILE=/tmp/dpd-build.env DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build

FROM base AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
