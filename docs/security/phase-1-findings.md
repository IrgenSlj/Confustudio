# Phase 1 Review Pass — Findings

**Gate:** P1, Security and trust boundaries

**Reviewed commit:** `6e5ea29` (`main`)

**Pass performed:** 2026-08-02

**Reviewer:** automated agent pass (Claude Opus 5). **This is not the independent
signoff** required by [`phase-1-review.md`](./phase-1-review.md) — that packet
states the implementer must not fill in the review result, and this pass shares
authorship lineage with the change set under review. The `Signoff` block in that
packet is deliberately left blank.

## Automated Evidence

Re-run in full against `6e5ea29`:

| Check                | Result                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `npm run audit:deps` | 0 vulnerabilities                                                          |
| `npm run format`     | clean                                                                      |
| `npm test`           | exit 0 — all 16 suites                                                     |
| provider policy      | 23 non-public addresses rejected, 4 public accepted                        |
| provider egress      | 7 configured upstream requests, **0** attacker requests, output normalized |
| abuse controls       | auth, origin/CSRF, rate/quota, token/spend, audit redaction all pass       |
| boundaries           | hostile text literal, batches atomic, 0 CSP violations across 7 pages      |
| server / UI smoke    | exact headers, Chromium smoke, no console errors                           |

Manual production-startup check also behaves as specified:

```
HOST=0.0.0.0 CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1 node server.mjs
→ Error: A non-loopback assistant requires CONFUSTUDIO_ACCESS_TOKEN with at
  least 32 characters   (throws before listening)
```

## F-1 — Legacy v2 restore bypassed the import boundary (High) — FIXED

`src/state.js` `loadState()`. The legacy v2 block runs **only** when the v3 block
threw, including when it threw because `validateProjectImport` rejected that same
blob. It then re-parsed the rejected data and `Object.assign`'d it into app state
with no bounds or schema check.

Contradicted two packet claims: "Imported/local-storage JSON is bounded … before
state mutation" and "Rejected imports preserve the current project."

Verified in Chromium. A `confustudio-v2` blob with a 5000-char track `name`
(schema bound 120), a string `volume` and an object `machine` reached live state
and broke rendering with `(trk.machine || 'tone').slice is not a function`, so
the app failed to boot — persistently, since the blob stays in `localStorage`.
`Object.assign` also honours a JSON-parsed own `__proto__` key, re-parenting the
track object. Global `Object.prototype` was **not** polluted; the effect is
scoped to the track object.

Fixed on `security/04-legacy-restore-boundary` (PR #35): validate at the same
boundary as any other import, and copy track fields skipping prototype-bearing
keys. Regression: `legacyV2RestoreValidated` in `tests/trust-boundaries.mjs`.

## F-2 — Hostile-state coverage had no legacy-key case (Medium) — FIXED

`tests/browser-boundaries.mjs` seeded hostile fixtures only under the v3 key
`confustudio-v3`, so the legacy v2 restore path had **no** coverage. Its DOM
assertions are also scoped to `#page-content`, so injection into persistent
chrome outside that subtree would not be seen. F-1 sat in exactly this gap and
the suite stayed green. Node-level regression added with F-1; the `#page-content`
scoping is unchanged and noted below.

## F-3 — Unescaped attribute interpolation in unreachable code (Low) — OPEN

`src/keyboard.js:1019` interpolates persisted state into an HTML attribute with
no escaping:

```js
value = '${state.keyboardVelocity ?? 1}';
```

`keyboardVelocity` is a top-level state key covered by **no** schema —
`validateStateCollections` does not check it, and `deepMerge` copies arbitrary
top-level primitives verbatim — so it can hold an attacker-chosen string.

**Not currently exploitable.** The enclosing `renderPiano()` writes into
`#kbd-piano`, and that element exists nowhere in the repo's markup, so
`el.kbdPiano` is always null and the function never runs. Confirmed by grep and
by a Chromium repro that could not reach the sink. It is a latent defect that
becomes live the moment `#kbd-piano` is added. Note that `script-src 'self'`
would still block an injected inline handler, so CSP is the backstop.

## F-4 — Hosted egress re-resolves DNS after validation (Low) — OPEN

`assertHostedProviderDestination` resolves the hostname and rejects non-public
addresses, then `postProviderJson` calls `fetch(url)`, which performs its **own**
independent resolution. The validated addresses are not the ones connected to,
leaving a DNS-rebinding window between check and connect.

Severity is low here because hosted destinations come from server-owned
environment variables, not browser input, so exploiting it requires the operator
to have configured an attacker-controlled hostname. Worth listing in accepted
residual risk, which currently does not mention it.

## F-5 — Loopback bind issues sessions without a credential (Low) — OPEN

`createAssistantSecurity` treats a loopback bind as development: `issueSession`
sets `principalId = 'loopback-development'` and skips the bearer-token check
entirely. The only remaining gate is the `Origin` header, which a non-browser
client sets freely.

So an operator who binds `HOST=127.0.0.1` behind a reverse proxy — the standard
deployment shape — exposes an **unauthenticated** assistant to anyone who can
reach the proxy. This is partially covered by existing docs
(`assistant-abuse-controls.md` line 19, `DEPLOY.md` line 56 "Do not offer the
current proxy to other machines"), but the reverse-proxy case is not called out,
and public assistant deployment is prohibited anyway. Recommend an explicit
warning, or requiring a credential whenever `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1`
regardless of bind address.

## F-6 — Session table evicts oldest-first (Informational) — OPEN

`pruneSessions` runs `while (sessions.size >= 1000) sessions.delete(first)`,
dropping the oldest session by insertion order. Whoever can call the session
endpoint can therefore evict live sessions. Bounded by the single-operator model
already documented as residual risk.

## Observation — legacy v2 track merge is effectively dead

A schema-valid v2 blob is consumed by the v3 branch (which accepts a bare
`tracks` array), so the legacy branch is only ever reached by data that failed
validation. Its track merge never runs for valid input. Pre-existing migration
behaviour, deliberately left unchanged by the F-1 fix — altering user-data
migration semantics under a security fix would be the wrong place for it.

## Gate Status

F-1 was a High finding against the reviewed commit. Per the packet, "Gate P1
passes only with no unresolved critical/high finding."

- With PR #35 merged, F-1 is resolved and no open critical/high finding remains
  from this pass.
- F-3 through F-6 are Low/Informational and are candidates for the accepted
  residual-risk list rather than blockers.
- **An independent reviewer still has to perform and record the signoff.** This
  pass does not substitute for it.
