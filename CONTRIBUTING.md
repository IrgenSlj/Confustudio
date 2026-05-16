# Contributing to CONFUstudio

Thanks for your interest in contributing. CONFUstudio is an early-stage, browser-first music studio. Contributions of any size are welcome.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

## Getting set up

```bash
git clone https://github.com/IrgenSlj/Confustudio.git
cd Confustudio
npm install
npm start            # serves http://127.0.0.1:4173
```

Requires Node.js 20+. A modern Chromium-based browser is recommended for Web Audio, AudioWorklet, and WebMIDI coverage.

## Running tests and checks

```bash
npm run lint         # ESLint must be clean (no errors, ideally no warnings)
npm run format       # Prettier --check
npm test             # syntax + state + server + UI smoke (Playwright)
```

A pull request must keep `npm run lint` and `npm test` green. Use `npm run lint:fix` and `npm run format:fix` for autofixes.

## Branching and commits

- Branch off `main`.
- Use a short, descriptive branch name (e.g. `fix/sample-reload-toast`, `feat/arranger-shuffle`).
- Commit messages: imperative mood, short subject (≤ 72 chars), wrap body at 72 chars.
- Reference issues with `Fixes #123` / `Refs #123` when applicable.

## Pull requests

Before opening:

1. Run `npm run lint` and `npm test`.
2. If you changed UI behavior, exercise it in the browser and note what you tested in the PR body.
3. Keep PRs focused. Large refactors should be discussed in an issue first.
4. Document any new env vars, routes, command types, or migration notes in `README.md` / `NEXT_SESSION.md`.

Your PR should describe:

- What changed and why.
- How you tested it (commands run, browsers used, audio paths exercised).
- Any follow-up work you deliberately deferred.

## Coding conventions

- ES modules everywhere. The server uses `node:` builtins.
- 2-space indent, single quotes, semicolons. Prettier and ESLint are authoritative — match them rather than memorizing rules.
- Prefix intentionally unused variables with `_` (the ESLint config ignores those).
- Avoid `window._*` globals in new code. Existing ones are being consolidated under a single namespace (see `NEXT_SESSION.md` Phase 2).
- Keep audio-thread code (worklets) allocation-free in steady state.
- Use the command bus (`window.confustudioCommands.execute(...)`) for any user-visible, undoable state mutation. Direct mutation is acceptable for ephemeral UI state.

## Reporting bugs and proposing features

Open an issue with:

- For bugs: steps to reproduce, expected vs. actual behavior, browser + OS, console errors.
- For features: the use case, why the current workflow falls short, and any sketch of the UI.

## Security

If you find a security issue, please follow [SECURITY.md](./SECURITY.md) instead of filing a public issue.

## Licensing

By contributing, you agree that your contributions are licensed under the [Apache License, Version 2.0](./LICENSE), the same license as the project.
