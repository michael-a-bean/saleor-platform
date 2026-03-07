FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

ENV NEXT_OUTPUT=standalone

# Build-time environment configuration
# NEXT_PUBLIC_BUILD_ENV: "local" | "staging" | "production"
ARG NEXT_PUBLIC_BUILD_ENV=local
ENV NEXT_PUBLIC_BUILD_ENV=${NEXT_PUBLIC_BUILD_ENV}

ARG NEXT_PUBLIC_SALEOR_API_URL
ENV NEXT_PUBLIC_SALEOR_API_URL=${NEXT_PUBLIC_SALEOR_API_URL}
ARG NEXT_PUBLIC_STOREFRONT_URL
ENV NEXT_PUBLIC_STOREFRONT_URL=${NEXT_PUBLIC_STOREFRONT_URL}
ARG NEXT_PUBLIC_DEFAULT_CHANNEL
ENV NEXT_PUBLIC_DEFAULT_CHANNEL=${NEXT_PUBLIC_DEFAULT_CHANNEL}

# Get PNPM version from package.json
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Run codegen to generate GraphQL types
# If schema.graphql exists, use it; otherwise requires API to be running with --network=host
RUN if [ -f schema.graphql ]; then \
      USE_SCHEMA_FILE=true pnpm run generate; \
    else \
      pnpm run generate; \
    fi

RUN pnpm next build

# Production image, copy all the files and run next
FROM base AS runner
RUN apk upgrade --no-cache
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

# Runtime environment variables (can override build-time values for server-side code)
ARG NEXT_PUBLIC_BUILD_ENV=local
ENV NEXT_PUBLIC_BUILD_ENV=${NEXT_PUBLIC_BUILD_ENV}
ARG NEXT_PUBLIC_SALEOR_API_URL
ENV NEXT_PUBLIC_SALEOR_API_URL=${NEXT_PUBLIC_SALEOR_API_URL}
ARG NEXT_PUBLIC_STOREFRONT_URL
ENV NEXT_PUBLIC_STOREFRONT_URL=${NEXT_PUBLIC_STOREFRONT_URL}

# Docker labels for environment identification
LABEL com.saleor-platform.build-env="${NEXT_PUBLIC_BUILD_ENV}"
LABEL com.saleor-platform.component="storefront"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["node", "server.js"]
