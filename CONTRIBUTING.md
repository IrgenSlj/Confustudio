# Contributing to CONFUstudio

CONFUstudio is an early-stage browser music studio currently executing a
foundation reset. Contributions are welcome, but work must follow the blocking
phase order in [`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md) and the
live status in [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Code of Conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Setup

```bash
git clone https://github.com/IrgenSlj/Confustudio.git
cd Confustudio
npm install
npm start
```

Node.js 20+ is required. The current app is served at `http://127.0.0.1:4173`.
Keep the assistant server on loopback and do not use production provider keys.

## Before Starting Work

1. Confirm the owning roadmap phase is open.
2. Link a tracking issue from the development plan's PR sequence.
3. Identify the contract being changed and its rollback path.
4. Add a failing regression, fixture, or measurable baseline first.
5. Keep the change independently reviewable; do not combine foundation work with features.

Large changes to architecture or ordering require an ADR and updates to the plan,
roadmap, architecture, and next-session documents.

## Checks

```bash
npm run lint
npm run format
npm test
```

These compatibility checks are necessary but not sufficient. Add evidence based
on the affected boundary:

- Project/state: migration, corrupt input, quota, save/reload, and property tests.
- Commands/history: inverse, undo/redo, deterministic seed, target drift, and fuzz tests.
- Server/security: hostile requests, auth/origin/CSRF, egress, redirect, limits, and logs.
- Audio/transport: deterministic events, offline fixtures, CPU/jitter data, and listening notes.
- UI: Chromium/Firefox/WebKit where relevant, keyboard path, axe, screenshots,
  supported widths, and returning-user behavior.
- PWA: fresh, offline, returning, update, and rollback boot paths.
- AI: versioned task evals, guardrail denials, budget failure, trace redaction,
  and audition/merge identity.

Every pull request states before/after measurements for performance-sensitive work.

## Coding Rules

- Existing code uses ES modules, 2-space indentation, single quotes, semicolons,
  Prettier, and ESLint.
- New migrated boundaries use strict TypeScript and runtime schemas.
- Persistent edits go through the validated command reducer. Direct mutation is
  limited to clearly transient view/runtime data.
- Commands use stable target IDs, never current selection as an implicit target.
- Random behavior is seeded or materialized.
- Kernel and command packages remain pure: no DOM, Web Audio, storage, or globals.
- Audio-thread code performs no allocation in steady state when avoidable and no
  DOM, network, storage, or model work.
- Untrusted values render as text/template bindings, never string-built HTML.
- Do not introduce new `window.*` integration globals.
- New controls require an accessible name, keyboard behavior, stable dimensions,
  focus styling, and documented state coverage.

## Branches and Commits

- Branch from `main` with the plan prefix, such as `security/01-provider-egress`.
- Keep commits focused and use imperative subjects no longer than 72 characters.
- Reference issues with `Fixes #123` or `Refs #123`.
- Never mix generated asset churn or unrelated formatting into a foundation commit.

## Documentation Contract

Update documentation in the same pull request when a contract changes:

- `docs/ROADMAP.md` for completion status.
- `docs/ARCHITECTURE.md` for boundaries and decisions.
- `NEXT_SESSION.md` for the next approved batch.
- `docs/STUDIO_MANUAL.md` for shipped commands, controls, and workflows.
- Schema/migration notes for persisted formats.
- `SECURITY.md` and `docs/DEPLOY.md` for trust or release-boundary changes.

Do not mark target behavior as shipped until its acceptance evidence is committed.

## Security Reports

Follow [`SECURITY.md`](./SECURITY.md). Do not place exploits, keys, private projects,
or provider abuse details in public issues.

## Licensing

Contributions are licensed under the [Apache License 2.0](./LICENSE).
