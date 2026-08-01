# Assistant Authentication And Abuse-Control Policy

**Status:** interim security skeleton implemented; not approved for public deployment

**Owning issue:** [#13](https://github.com/IrgenSlj/Confustudio/issues/13)

**Updated:** 2026-08-01

This policy protects the current `server.mjs` assistant bridge until the separate
hosted API in Phase 6 replaces it. It is intentionally dependency-free and
single-process. It is not a user/account system and does not make the current
combined static-file and assistant server production-ready.

## Session Boundary

Assistant POST routes remain disabled unless
`CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1` is set.

- A server bound to loopback may issue a local-development session without an
  access credential. The browser obtains it from `POST /api/auth/session`.
- A non-loopback bind refuses to start the assistant unless
  `CONFUSTUDIO_ACCESS_TOKEN` contains at least 32 characters and
  `CONFUSTUDIO_ALLOWED_ORIGINS` contains one or more exact origins.
- Public configured origins require HTTPS. HTTP is accepted only for loopback or
  `NODE_ENV=test` fixtures.
- The access credential is exchanged only at the session endpoint. Assistant
  calls use an opaque, random, server-side session ID in an `HttpOnly`,
  `SameSite=Strict` cookie.
- Non-loopback cookies also carry `Secure`. Sessions expire after 12 hours by
  default and are lost on process restart.
- Every assistant mutation requires an exact allowed `Origin` and the random CSRF
  token returned when the session was issued.

The current non-loopback credential represents one operator principal. It is not
multi-user authentication. A production service still needs real identity,
authorization, revocation, persistent/distributed sessions, and secret storage.

## Request Controls

Reservations happen before provider egress. Provider failures still consume the
reservation so retries cannot bypass limits. Limits are applied to the principal,
not a session cookie, so creating a new session does not reset usage.
Provider models are server-owned; a browser cannot select a higher-cost model and
invalidate the configured spend estimate.

| Environment variable              |    Default | Meaning                                                          |
| --------------------------------- | ---------: | ---------------------------------------------------------------- |
| `CONFUSTUDIO_RATE_WINDOW_MS`      |     60,000 | Sliding fixed-window duration                                    |
| `CONFUSTUDIO_RATE_LIMIT`          |         12 | Requests per window                                              |
| `CONFUSTUDIO_DAILY_REQUEST_LIMIT` |        100 | Requests per UTC day                                             |
| `CONFUSTUDIO_MAX_REQUEST_TOKENS`  |      4,096 | Estimated input plus reserved output per request                 |
| `CONFUSTUDIO_MAX_OUTPUT_TOKENS`   |      1,024 | Maximum output sent to a provider                                |
| `CONFUSTUDIO_DAILY_TOKEN_LIMIT`   |    100,000 | Estimated/reserved tokens per UTC day                            |
| `CONFUSTUDIO_DAILY_COST_MICROS`   |  1,000,000 | Conservative daily cost ceiling in millionths of a currency unit |
| `CONFUSTUDIO_UPSTREAM_TIMEOUT_MS` |     30,000 | Provider request deadline                                        |
| `CONFUSTUDIO_SESSION_TTL_MS`      | 43,200,000 | Session lifetime                                                 |

Input tokens are conservatively estimated from UTF-8 bytes; output tokens are
reserved before the request. Cost uses configurable input/output micro-unit rates
per million tokens. This is a circuit breaker, not provider billing or accounting.
Production quotas must use provider-confirmed usage and a durable per-user ledger.

Stable denials include `AUTHENTICATION_REQUIRED`, `ORIGIN_FORBIDDEN`,
`CSRF_TOKEN_INVALID`, `RATE_LIMIT_EXCEEDED`, request/daily token limits, daily
request quota, daily spend budget, body-size/JSON errors, model override, and
`UPSTREAM_TIMEOUT`.

## Audit Contract

Security events are newline-delimited JSON prefixed with `[security-audit]`. They
contain time, event, outcome, route, a one-way truncated principal hash, stable
error code, reserved token/cost counts, and provider identifier where applicable.

Audit records never contain session IDs, CSRF tokens, access/provider credentials,
prompts, messages, project context, provider responses, or arbitrary request data.
The current stdout sink is an interim local/deployment stream; retention, access
control, integrity, and alerting belong to the hosted API.

## Evidence And Rollback

`npm run test:security` covers:

- non-loopback configuration refusal without credentials/origins;
- anonymous, wrong-origin, and missing-CSRF denial over real HTTP;
- secure cookie attributes and authenticated request progression;
- rate, daily request, request token, daily token, and spend ceilings;
- prompt/credential audit redaction;
- provider timeout, egress, redirect, response-size, and assistant-command denial.

Rollback keeps `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY` unset and reverts
`src/server/assistant-security.mjs`, the session route, and client session adapter.
No project or user data migration is involved.
