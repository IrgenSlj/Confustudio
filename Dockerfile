# ── Build stage ───────────────────────────────────────────────────────────────
# Produces the hashed production assets. Kept separate so the runtime image
# never carries npm, devDependencies, or a node_modules tree.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.js index.html ./
COPY src ./src
COPY public ./public

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# The server itself uses only Node stdlib, so the runtime still installs
# nothing. Copy just what it serves.
COPY package.json server.mjs index.html README.md ./
COPY src ./src
COPY public ./public
COPY docs ./docs

# server.mjs serves dist/ when it exists and falls back to the sources
# otherwise, so deleting this directory is the documented rollback and works
# inside the container too.
COPY --from=build /app/dist ./dist

# NODE_ENV=production makes server.mjs bind 0.0.0.0 (loopback-only is the local
# dev default and is unreachable from outside a container). HOST is set too as
# belt-and-suspenders; PORT is honored if the platform injects its own.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

# Run as the built-in unprivileged user.
USER node

EXPOSE 4173

# Alpine ships busybox wget; hit the dependency-free liveness route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/healthz || exit 1

CMD ["node", "server.mjs"]
