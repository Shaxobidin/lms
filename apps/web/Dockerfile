# =============================================================================
# QDU LMS — frontend image (Next.js 15 standalone).
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

FROM base AS deps
RUN npm ci --workspaces --include-workspace-root

# --- Ishlab chiqish ----------------------------------------------------------
FROM deps AS development
ENV NODE_ENV=development

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN npm run build --workspace=@lms/shared

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "dev", "-p", "3000"]

# --- Qurish ------------------------------------------------------------------
FROM deps AS builder
ENV NODE_ENV=production
# Telemetriya o'chiriladi (ma'lumot tashqariga chiqmasin — §11)
ENV NEXT_TELEMETRY_DISABLED=1

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build vaqtida kerak bo'ladigan ochiq o'zgaruvchilar
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_MEDIA_URL=http://localhost:9000
ARG NEXT_PUBLIC_APP_NAME="QDU LMS"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME

RUN npm run build --workspace=@lms/shared \
 && cd apps/web && npx next build

# --- Ishlab chiqarish --------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache tini \
 && addgroup -g 1001 -S lms \
 && adduser -u 1001 -S lms -G lms

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `standalone` chiqishi barcha zarur bog'liqliklarni o'z ichiga oladi
COPY --from=builder --chown=lms:lms /app/apps/web/.next/standalone ./
COPY --from=builder --chown=lms:lms /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=lms:lms /app/apps/web/public ./apps/web/public

USER lms
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
