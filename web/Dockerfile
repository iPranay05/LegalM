# ── Stage 1: Install dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy lockfile and package manifest only — lets Docker cache this layer
# and skip npm install on rebuilds where only source files changed.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ── Stage 2: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Receive the public API URL at build time so Next.js can bake it into
# the static bundle. Render passes this from the env var declared in
# render.yaml (NEXT_PUBLIC_API_URL).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy all source files
COPY . .

# next.config.js has output: "standalone" — this produces a self-contained
# .next/standalone directory that includes only what's needed at runtime.
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable Next.js telemetry in production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone output (server + node_modules subset)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets (CSS, JS chunks, images)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public folder — create it first so the COPY never fails on an empty dir
RUN mkdir -p ./public
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# HOSTNAME must be 0.0.0.0 so Render's health checker can reach the container
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["node", "server.js"]
