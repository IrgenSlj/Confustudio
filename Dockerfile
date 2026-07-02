# CONFUstudio — production image
#
# The server (server.mjs) uses only Node.js built-in modules and has ZERO
# runtime npm dependencies, so there is no `npm install` / build step: we just
# copy the source the server needs and run it. This keeps the image small and
# the build fast.
#
# The Node server itself sets the COOP/COEP cross-origin-isolation headers
# (Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy) that SharedArrayBuffer
# + AudioWorklet require, so any host that runs this container preserves them.
FROM node:22-slim

# NODE_ENV=production makes the server bind 0.0.0.0 (see server.mjs host default).
# PORT is a default; PaaS platforms (e.g. Render) may inject their own PORT and
# the server honours it via process.env.PORT.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app

# Copy only what the server needs at runtime.
# docs/ is required: server.mjs loads docs/confustudio.manual.json at startup and
# serves /docs/* routes.
COPY package.json ./
COPY server.mjs index.html ./
COPY src ./src
COPY public ./public
COPY docs ./docs

# Run as the built-in, unprivileged `node` user.
USER node

EXPOSE 4173

CMD ["node", "server.mjs"]
