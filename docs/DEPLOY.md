# Deploying CONFUstudio

**Status:** local evaluation only; public assistant deployment blocked

**Updated:** 2026-08-01

The previous container instructions exposed the static application and assistant
proxy as one public service. That topology is not approved. The current bridge has
tested provider egress, browser, session, origin/CSRF, quota, budget, timeout, and
audit boundaries, but still combines concerns and uses one in-memory operator
principal. Those interim controls do not make it a public service.

See [`../SECURITY.md`](../SECURITY.md) and Phase 6 of
[`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md).

## Supported Today: Local Evaluation

```bash
npm install
npm start
# open http://127.0.0.1:4173
```

Keep the process bound to loopback. Use synthetic projects and test credentials
only. Local OpenAI-compatible or Ollama endpoints are development integrations,
not public proxy features.

Assistant POST routes are disabled by default. Local test sessions must opt in
with `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1`; never set it on a public deployment
of the current server.

The temporary bridge fixes provider destinations and models server-side, rejects
redirect/private-host escape, restricts local providers to loopback, bounds
requests/responses, and applies an interim session and abuse-control policy. Public
deployment remains prohibited because production identity, durable/distributed
enforcement, operational audit infrastructure, and the separate hosted API do not
exist. See [`security/provider-egress.md`](./security/provider-egress.md) and
[`security/assistant-abuse-controls.md`](./security/assistant-abuse-controls.md).

Useful checks:

```bash
curl http://127.0.0.1:4173/healthz
npm run audit:deps
npm test
```

The studio itself should work without any provider configuration.

## Production Build

`server.mjs` serves `dist/` when a build exists and the sources otherwise. Both
modes are verified to behave identically, so building is optional locally.

```bash
npm run build      # hashed assets into dist/
npm start          # serves dist/ because it now exists
rm -rf dist        # rollback: back to serving sources, no other change
```

`npm run dev:vite` runs the Vite dev server instead of `server.mjs`. It sends the
same COOP/COEP headers, because AudioWorklet needs cross-origin isolation and the
two dev paths must not diverge.

Two build details are load-bearing and are enforced by `npm run test:build`:

- Worklets are referenced with `new URL('./worklets/…', import.meta.url)`, never a
  literal `/src/` path, which would 404 once assets are hashed.
- Worklets are never inlined. Assets below Vite's 4 KB inline limit become `data:`
  URLs, and the CSP is `script-src 'self'`, so an inlined worklet fails
  `audioWorklet.addModule()` at runtime. A dead worklet's only symptom is missing
  sound, so this is checked rather than assumed.

The container build is multi-stage: assets are built in a stage that has npm, and
the runtime image still installs nothing and runs only Node stdlib.

## Prohibited Until the Security Gate Passes

- Do not run the current container on a public interface.
- Do not add production OpenAI, Anthropic, or other hosted-provider keys.
- Do not deploy the current `fly.toml` or `render.yaml` as an internet-facing service.
- Do not rely on CORS, COOP/COEP, or a secret URL as access control.
- Do not offer the current proxy to other machines on a private network.

The existing deployment artifacts remain in the repository as historical scaffolding
and will be replaced or constrained during the implementation plan.

## Target Deployment Topology

```text
Static PWA/CDN
  - hashed Vite assets
  - COOP/COEP and browser security headers
  - generated service-worker revisions
  - no provider credentials

Authenticated hosted API
  - separate origin/service
  - fixed provider destinations
  - encrypted secret storage
  - session authentication and authorization
  - CSRF/origin policy
  - per-user quotas, rate limits, and spending caps
  - request/response size and time budgets
  - redacted audit and abuse monitoring

Loopback bridge
  - optional local/Ollama providers
  - binds only to 127.0.0.1/::1
  - never shares the public API trust boundary
```

## Future Release Checklist

The hosted deployment documentation will be re-enabled only when all items below
have automated evidence:

- [ ] Vite production build and generated asset revisioning.
- [ ] Fresh, returning-user, offline, service-worker update, and rollback boots.
- [ ] `crossOriginIsolated === true` where required by the audio runtime.
- [x] CSP, frame, content-type, referrer, and permissions policies on the current server.
- [x] Exact server-owned provider origin/path policy and redirect rejection.
- [~] Interim session, CSRF, origin, rate, quota, and budget tests; production
  identity, authorization, and durable enforcement remain Phase 6.
- [ ] No secret in browser responses, logs, traces, URLs, or arbitrary egress.
- [ ] Database, migration, backup, deletion, and recovery procedures.
- [ ] Health, readiness, structured logging, alerting, and incident rollback.
- [ ] Independent security review and maintainer sign-off.

Host-specific commands, secrets, regions, scaling, and cost controls will be added
after the topology is implemented. Until then, a successful container start is not
evidence that the application is safe to publish.
