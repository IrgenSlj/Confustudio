# Phase 1 Independent Security Review Packet

**Gate:** P1, Security and trust boundaries

**Status:** PASS — signed off 2026-08-02 (see Signoff)

**Prepared:** 2026-08-01

This packet defines the review scope and acceptance evidence for Gate P1 in
[`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md). The implementer must not fill
in the independent-review result.

## Change Set

| Commit    | Boundary                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `13c6567` | Provider destination, credential, redirect, private-network, response-size, and normalization policy |
| `1347f35` | Runtime import/command schemas, safe rendering, filename policy, CSP, and hostile browser tests      |
| `aee30c9` | Session, origin/CSRF, rate/quota/token/cost/time controls, client adapter, and redacted audits       |
| `08416b2` | High-severity dependency remediation and CI audit gate                                               |
| `6e96a30` | User-visible project/audio persistence recovery and failure states                                   |
| `01d1cfa` | Stable oversized/invalid-body errors, constant-time credential comparison, and server-owned models   |

Review the aggregate diff from the Phase 0 baseline through current `main`, not
only the final commit:

```bash
git diff 53c3771..main
```

## Threat Checklist

The reviewer should attempt to invalidate each claim:

- Browser fields cannot choose a hosted provider destination, credential, or model.
- Hosted egress rejects non-HTTPS, private/reserved IPs, DNS results containing a
  non-public address, origin escape, and redirects.
- Local provider routing accepts loopback only and never shares hosted policy.
- Provider errors and successful results do not expose native upstream payloads,
  credentials, configured URLs, or internal debug fields.
- Imported/local-storage JSON is bounded by bytes, depth, values, containers,
  collections, strings, assets, and dangerous-key checks before state mutation.
- Rejected imports preserve the current project; hostile strings render only as text.
- UI and assistant command batches reject unknown fields/types/targets before any
  command in the batch mutates state.
- Every assistant mutation requires an authenticated server-side session, exact
  allowed origin, and matching CSRF token when the proxy is enabled.
- Non-loopback assistant startup fails without a sufficiently long access token
  and exact allowed origins; local bootstrap is impossible on a non-loopback bind.
- New sessions do not reset principal rate, daily request, token, or cost usage.
- Body, output-token, daily-token, spend, response-size, and provider-time budgets
  fail closed with stable codes before unbounded work or egress.
- Audit output excludes prompts, project context, responses, session/CSRF tokens,
  access credentials, provider credentials, and arbitrary request fields.
- CSP blocks inline script and external resource drift; all response classes retain
  the security-header baseline.
- Project quota recovery and hard project/audio persistence failures are visible
  to the user and do not falsely advance the last successful-save time.

## Reproduction

Use synthetic credentials and fixtures only.

```bash
npm ci
npm run audit:deps
npm test
npm run format
```

Expected automated evidence:

- dependency audit: zero known vulnerabilities at the committed lockfile;
- provider policy: public/private address cases and zero attacker egress;
- abuse controls: auth, origin/CSRF, rate/quota, token/spend, timeout, and redaction pass;
- boundaries: hostile content stays literal, batches stay atomic, zero CSP violations;
- persistence: `saved`, sparse `recovered`, and hard `failed` states pass;
- server/UI: exact headers and Chromium smoke pass with no console errors.

Also inspect production startup failure manually:

```bash
HOST=0.0.0.0 CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1 node server.mjs
```

It must exit before listening because non-loopback credentials/origins are absent.

## Accepted Residual Risk

These are release blockers or later planned boundaries, not claims of completion:

- Public assistant deployment remains prohibited and default-off.
- The interim access token represents one operator, not production user identity.
- Sessions, quotas, rates, and usage are single-process and in memory.
- The combined static/assistant server is not the Phase 6 hosted API.
- Audit output has no durable integrity, retention, alerting, or access-control system.
- CSP still permits inline styles while the legacy UI uses style attributes; inline
  scripts are not permitted.
- Hosted egress validates resolved addresses and then `fetch` resolves the hostname
  again independently, so a DNS rebind between check and connect is not prevented.
  Destinations are server-owned environment configuration, not browser input.
- A loopback bind issues assistant sessions without an access credential, and the
  `Origin` header it relies on is trivially set by non-browser clients. Placing a
  reverse proxy or port forward in front of a loopback bind therefore exposes an
  unauthenticated assistant; startup warns about this.
- The session table evicts oldest-first once it reaches 1000 entries, so whoever can
  reach the session endpoint can evict live sessions.
- External module manifests and the sparse project v4 schema await typed core work.
- The current eager localStorage project model remains oversized pending Phase 2.
- An independent review can still reject any residual item as too severe for P1.

## Signoff

```text
Reviewer:          IrgenSlj (repository owner), on an agent-assisted review pass
Date:              2026-08-02
Reviewed commit:   0f0efd7
Critical findings: 0
High findings:     1 — F-1, legacy v2 restore bypassed the import boundary.
                   Resolved in #35 before signoff; no unresolved high finding.
Required follow-ups:
                   F-4 hosted egress re-resolves DNS after validation — accepted
                     residual risk; real fix is address pinning, revisit with the
                     Phase 6 hosted API.
                   F-5 loopback bind issues sessions without a credential —
                     accepted; startup warns, deliberate local bootstrap.
                   F-6 session table evicts oldest-first — accepted.
Gate P1 result:    PASS
```

Basis and limits of this signoff, recorded honestly so a later reader can judge
its weight:

- Findings and evidence are in [`phase-1-findings.md`](./phase-1-findings.md).
  The threat checklist above was worked against `6e5ea29`, the full automated
  evidence was re-run, and the production-startup failure was checked manually.
- The reviewer of record is the repository owner, who accepted F-4, F-5 and F-6
  as residual risk after they were put to them explicitly. The supporting pass
  was performed by an agent that also authored the change set — so this is
  **not** an arms-length third-party review, and it should not be represented as
  one. It is the owner accepting the risk on a documented basis.
- A genuine external review remains worthwhile before any public exposure, and
  is a prerequisite of Gate P6 regardless of this result.

Gate P1 passes only with no unresolved critical/high finding. Passing P1 does not
authorize public AI deployment; that remains blocked until Gate P6 and issue #34.
