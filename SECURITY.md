# Security Policy

## Supported versions

CONFUstudio is in early development. Only the latest commit on `main` is supported.

## Reporting a vulnerability

Please do not open a public issue for security reports.

Instead, open a private security advisory on GitHub:
https://github.com/IrgenSlj/Confustudio/security/advisories/new

Include:

- A description of the issue and its impact.
- Steps to reproduce, ideally with a minimal proof of concept.
- Affected files or routes.
- Your suggested fix, if you have one.

You can expect an initial response within a few days. We will work with you on a fix and coordinate disclosure timing.

## Scope

The local server (`server.mjs`) binds to `127.0.0.1` by default. Issues that require exposing the server to the public internet are out of scope unless they demonstrate a problem in the default configuration.

The assistant bridge proxies requests to OpenAI, Anthropic, and other model providers. API keys are read from environment variables and are never written to disk. Reports about key handling or proxy abuse are in scope.
