# Deploying CONFUstudio

CONFUstudio is a single dependency-light Node server (`server.mjs`) that serves
the static app and an optional AI bridge. It needs two things most static hosts
can't give it, which is why it deploys as a **container**, not a static bundle:

1. **COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`,
   `Cross-Origin-Embedder-Policy: require-corp`) on every response — required
   for `SharedArrayBuffer` and AudioWorklet. Netlify/Vercel static hosting can
   set headers, but the AI bridge needs a running server anyway.
2. **A server-side home for AI keys** — keys are read from the process
   environment and never sent to the browser.

## Recommended: Fly.io

Greenfield config lives in `fly.toml` + `Dockerfile`. Scales to zero when idle,
so a pre-launch deploy costs ~nothing.

```bash
# one-time
fly auth login
fly launch --copy-config --now       # uses fly.toml/Dockerfile; pick app name + region

# optional AI bridge (keys stay server-side)
fly secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-sonnet-5

# subsequent deploys
fly deploy
```

Health check: `GET /healthz` → `{"ok":true}`. Configured in `fly.toml`.

## Any container host (Render / Railway / a VPS)

The image is portable. Binding to all interfaces is automatic: the server
binds `127.0.0.1` for local dev but `0.0.0.0` when `NODE_ENV=production` (set
in the Dockerfile), so containers are reachable without extra flags. `HOST`
overrides it if you need to.

```bash
docker build -t confustudio .
docker run --rm -p 4173:4173 confustudio
# → http://localhost:4173  (healthcheck: /healthz)
```

- **Render:** one-click via **New → Blueprint** (`render.yaml` is committed),
  or a Docker web service with health check path `/healthz`. Add AI keys as
  environment variables (marked secret).
- **Railway:** deploy the Dockerfile; Railway injects `PORT` (the server
  respects it). Add keys as variables.

## After deploy — verify in a real browser (mandatory)

`npm test` green ≠ working app. On the live URL, hard-reload past any service
worker, then confirm:

- App renders; **zero console errors** on first load AND on reload (the
  returning-user path — see the `deepMerge` data-loss fix).
- `crossOriginIsolated === true` in the console (COOP/COEP landed through the
  platform's proxy).
- If the AI bridge is configured: `GET /api/assistant/providers` reports it
  `configured: true`.

## Notes

- No build step, no bundler — the browser loads ES modules directly.
- `confu/` (Electron) is not part of the web deploy.
- PWA install + offline shell come from `public/sw.js`; after a deploy, the
  service worker is network-first for the shell (see the stale-cache postmortem).
