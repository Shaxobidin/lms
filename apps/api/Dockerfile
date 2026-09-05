# =============================================================================
# QDU LMS — API image (ko'p bosqichli).
#
# `development` bosqichi: hot-reload bilan ishlab chiqish uchun.
# `production` bosqichi: minimal, root bo'lmagan foydalanuvchi bilan.
# =============================================================================

# --- Umumiy asos -------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app

# Prisma engine va argon2 uchun kerakli kutubxonalar
RUN apk add --no-cache openssl libc6-compat

# Monorepo manifestlarini alohida qatlamda ko'chiramiz — kod o'zgarganda
# `npm ci` qayta bajarilmaydi (Docker layer keshi).
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# --- Bog'liqliklar -----------------------------------------------------------
FROM base AS deps
RUN npm ci --workspaces --include-workspace-root

# --- Ishlab chiqish ----------------------------------------------------------
FROM deps AS development
ENV NODE_ENV=development

# FFmpeg — video transkodlash uchun (A-11)
RUN apk add --no-cache ffmpeg

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN npm run build --workspace=@lms/shared \
 && npx prisma generate --schema=apps/api/prisma/schema.prisma

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "run", "dev"]

# --- Qurish ------------------------------------------------------------------
FROM deps AS builder
ENV NODE_ENV=production

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN npm run build --workspace=@lms/shared \
 && npx prisma generate --schema=apps/api/prisma/schema.prisma \
 && npm run build --workspace=@lms/api

# Ishlab chiqarish uchun keraksiz paketlarni olib tashlaymiz
RUN npm prune --omit=dev --workspaces --include-workspace-root

# --- Ishlab chiqarish --------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat ffmpeg tini \
 && addgroup -g 1001 -S lms \
 && adduser -u 1001 -S lms -G lms

ENV NODE_ENV=production

COPY --from=builder --chown=lms:lms /app/node_modules ./node_modules
COPY --from=builder --chown=lms:lms /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=lms:lms /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=lms:lms /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=lms:lms /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=lms:lms /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=lms:lms /app/package.json ./

USER lms
EXPOSE 4000

# tini — PID 1 sifatida signallarni to'g'ri uzatadi (graceful shutdown)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
