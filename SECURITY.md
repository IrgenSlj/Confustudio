# Security Policy

## Current Security Status

CONFUstudio is in early development. Only the latest commit on `main` is
supported. The application is suitable for local evaluation, but the current
assistant proxy must not be exposed publicly or configured with production API
keys. Public hosted-provider deployment is blocked until Phase 6 of
[`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md) passes.

Provider destinations are server-owned, redirects fail closed, local providers
are loopback-only, and upstream responses are bounded and normalized. Imported
projects and persisted values now cross bounded runtime schemas and safe rendering
adapters; command batches and assistant plans share a fail-closed allowlist; the
server applies a tested CSP and browser-header baseline. Missing public API
authentication and abuse controls remain the active release blocker.

The provider policy and residual risks are documented in
[`docs/security/provider-egress.md`](./docs/security/provider-egress.md). Browser
rendering, imports, commands, CSP, and their remaining limitations are documented
in [`docs/security/browser-boundaries.md`](./docs/security/browser-boundaries.md).

## Reporting a Vulnerability

Do not open a public issue. Open a private GitHub security advisory:

https://github.com/IrgenSlj/Confustudio/security/advisories/new

Include:

- A description of the issue and likely impact.
- Reproduction steps and a minimal proof of concept when possible.
- Affected files, routes, providers, project formats, or browser versions.
- Whether credentials, imported projects, local network access, or persistence
  are involved.
- A suggested remediation, if available.

Do not include real provider credentials or private project/audio data. Use test
keys and synthetic fixtures. The maintainer will acknowledge reports as capacity
allows and coordinate remediation and disclosure.

## Scope

In scope:

- Browser application, project import/export, persistence, PWA, and service worker.
- `server.mjs` static and assistant routes, including loopback use.
- Provider credentials, proxy abuse, SSRF, redirect handling, and response leakage.
- Command/tool validation, agent guardrails, proposal merge, and prompt injection.
- Module manifests, audio assets, filenames, and workspace packages.
- Authentication, authorization, CSRF, origin policy, quotas, and rate limiting
  once the hosted API exists.
- Dependency and build-chain vulnerabilities with a plausible project impact.

The fact that an exploit requires a non-default public deployment does not make it
out of scope. Deployment files and documentation are part of the supported system.

Generally out of scope:

- Denial of service requiring physical access to the same machine and no trust
  boundary bypass.
- Vulnerabilities exclusively in unsupported browser versions.
- Social engineering, spam, and scanner-only reports without a reproducible impact.

## Deployment Rules

- The current server binds to loopback for development. Do not override that for
  internet exposure while the security block is active.
- Assistant POST routes are disabled unless
  `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1` is set. This kill switch is containment,
  not authorization or an egress defense.
- Provider URLs and keys are server configuration. Browser `baseUrl` and `apiKey`
  fields are rejected.
- Hosted provider URLs require public HTTPS destinations and never follow redirects.
- Local provider URLs are restricted to loopback.
- Do not place production keys in a publicly reachable current process.
- Do not treat CORS as authentication or an SSRF defense.
- Imported projects and provider output are untrusted data.
- Imported JSON must pass the bounded runtime validator before normalization or mutation.
- UI and assistant command batches must pass the same command allowlist before mutation.
- Secrets must never appear in browser responses, logs, traces, fixtures, project
  packages, URLs, or arbitrary outbound requests.

## Release Gate

Before public AI use, the project requires fixed provider egress, redirect policy,
authentication, CSRF/origin controls, per-user quotas and rate limits, request and
response budgets, audit events, CSP, hostile import fixtures, and an independent
security review. The detailed checklist is Phase 1 and Phase 6 of the development plan.
