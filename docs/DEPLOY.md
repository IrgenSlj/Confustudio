# Deploying CONFUstudio

**Status:** local evaluation only; public assistant deployment blocked

**Updated:** 2026-07-31

The previous container instructions exposed the static application and assistant
proxy as one public service. That topology is not approved. The current proxy can
attach server credentials to a client-selected destination and does not yet have
the authentication, quota, origin, or egress controls required for public use.

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

Useful checks:

```bash
curl http://127.0.0.1:4173/healthz
npm test
```

The studio itself should work without any provider configuration.

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
- [ ] CSP, frame, content-type, referrer, and permissions policies.
- [ ] Exact provider origin/path allowlist and redirect rejection.
- [ ] Authentication, authorization, CSRF, origin, rate, quota, and budget tests.
- [ ] No secret in browser responses, logs, traces, URLs, or arbitrary egress.
- [ ] Database, migration, backup, deletion, and recovery procedures.
- [ ] Health, readiness, structured logging, alerting, and incident rollback.
- [ ] Independent security review and maintainer sign-off.

Host-specific commands, secrets, regions, scaling, and cost controls will be added
after the topology is implemented. Until then, a successful container start is not
evidence that the application is safe to publish.
