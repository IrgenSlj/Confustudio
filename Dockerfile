FROM node:22-alpine

WORKDIR /app

# No dependencies to install — the server uses only Node stdlib, so there is no
# npm install / build step. Copy just what the server serves at runtime.
COPY package.json server.mjs index.html README.md ./
COPY src ./src
COPY public ./public
COPY docs ./docs

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
