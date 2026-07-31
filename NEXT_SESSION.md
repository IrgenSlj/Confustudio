# CONFUstudio Next Session

**State:** Phase 0 complete; Phase 1 active

**Branch:** `main`

**Updated:** 2026-07-31

## Read First

1. [`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md) owns sequencing and gates.
2. [`docs/baselines/phase-0-gate.md`](./docs/baselines/phase-0-gate.md) records the baseline evidence.
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) defines target boundaries.
4. [`SECURITY.md`](./SECURITY.md) defines the release block.

## Completed Batch

`plan/00-baselines`, issue
[#10](https://github.com/IrgenSlj/Confustudio/issues/10):

- Foundation ADR accepted.
- Reference Node/browser baseline captured.
- Eight scrubbed migration, corrupt, limit, and hostile fixtures committed.
- All 25 work items created as issues #10-#34 with owner, dependency,
  acceptance, and rollback fields.
- Assistant POST routes are default-off behind
  `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1`.
- Disabled proxy regression proves no outbound request or credential forwarding.
- Public provider metadata no longer exposes configured upstream base URLs.

## Next Batch

`security/01-provider-egress`, issue
[#11](https://github.com/IrgenSlj/Confustudio/issues/11).

Scope:

- Remove request-body `baseUrl` from hosted OpenAI and Anthropic routing.
- Define exact hosted provider origins and paths from server configuration.
- Reject cross-origin redirects and unexpected provider protocols.
- Add private/loopback/link-local address denial for the hosted-provider path.
- Keep local/OpenAI-compatible and Ollama access separate and loopback-only.
- Normalize provider responses and bound response bodies.
- Add fake-upstream tests for credential destination, redirects, and private addresses.

Do not add authentication, CSP/import validation, Vite, state migration, UI work,
or audio work to this batch. Those have separate issues and rollback boundaries.

## Release Block

The default-off flag is containment, not a security boundary. Even when explicitly
enabled, the current proxy is local-development only. Public assistant deployment
remains prohibited until the Phase 6 hosted API and security review pass.
