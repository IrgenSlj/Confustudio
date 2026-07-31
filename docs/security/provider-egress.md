# Provider Egress Policy

**Status:** implemented for the temporary local assistant bridge

**Issue:** [#11](https://github.com/IrgenSlj/Confustudio/issues/11)

**Public deployment:** still prohibited

This policy contains provider credentials and server-side requests while the
future authenticated hosted API is not yet built. It does not provide user
authentication, authorization, quotas, CSRF protection, or a public-service
abuse boundary.

## Browser Contract

The browser may send:

- Provider ID.
- Message or message list.
- Bounded generation settings currently supported by the bridge.
- Project context required by the assistant prompt.

The browser may not send:

- `baseUrl` or any other provider destination.
- `apiKey` or another provider credential.
- Redirect policy, response limits, or network policy.

Requests containing forbidden provider configuration fail with
`CLIENT_PROVIDER_CONFIG_FORBIDDEN` before provider resolution or outbound I/O.

## Hosted Providers

OpenAI and Anthropic destinations come only from server environment variables.
The defaults are `https://api.openai.com` and `https://api.anthropic.com`.

| Provider  | Server URL           | Fixed appended path | Credential          |
| --------- | -------------------- | ------------------- | ------------------- |
| OpenAI    | `OPENAI_BASE_URL`    | `/v1/responses`     | `OPENAI_API_KEY`    |
| Anthropic | `ANTHROPIC_BASE_URL` | `/v1/messages`      | `ANTHROPIC_API_KEY` |

Hosted destination rules:

- HTTPS is mandatory.
- Userinfo, query strings, and fragments are rejected in base configuration.
- The final endpoint must retain the configured origin.
- Literal and DNS-resolved non-public addresses are rejected, including
  loopback, private, link-local, carrier-grade NAT, documentation, benchmark,
  multicast/reserved, IPv4-mapped IPv6, unique-local IPv6, and NAT64 ranges.
- Redirects are returned as an error and are never followed.
- The native provider payload is never returned to the browser.

Server administrators control URL overrides. They must use a stable, trusted,
public HTTPS origin. DNS validation is defense in depth and does not turn an
untrusted custom provider domain into a safe destination.

## Local Providers

Local OpenAI-compatible and Ollama providers are a separate policy class.

| Provider                | Server URL                                  | Fixed appended path | Credential                  |
| ----------------------- | ------------------------------------------- | ------------------- | --------------------------- |
| Local OpenAI-compatible | `LOCAL_AI_BASE_URL` or `ASSISTANT_BASE_URL` | `/chat/completions` | optional `LOCAL_AI_API_KEY` |
| Ollama                  | `OLLAMA_HOST`                               | `/api/chat`         | none                        |

Only `localhost`, `127.0.0.0/8`, and `::1` are accepted. LAN hosts, public hosts,
and client-supplied destinations are rejected. Local credentials are read from
the server environment, not the project or browser payload.

## Response and Error Policy

- Outbound redirects use `manual` mode and fail with `UPSTREAM_REDIRECT_REJECTED`.
- Provider responses are limited to 1 MiB while streaming. Declared and actual
  oversize bodies fail with `UPSTREAM_RESPONSE_TOO_LARGE`.
- Requests time out after 60 seconds and fail with `UPSTREAM_TIMEOUT`.
- Upstream status and transport errors are normalized. Raw response bodies and
  internal debug fields are not reflected.
- Successful browser responses contain only `provider`, `model`, and extracted `text`.

## Test-Only Origins

Integration tests use loopback fake providers. HTTP/private hosted origins are
accepted only when both conditions are true:

```text
NODE_ENV=test
CONFUSTUDIO_ALLOW_TEST_PROVIDER_ORIGINS=1
```

Do not set this flag outside tests. It is ignored unless `NODE_ENV` is exactly
`test`.

## Residual Risk

The temporary bridge is disabled unless
`CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1` is set. Even with this egress policy, it is
local-development only because it has no user authentication, CSRF/origin policy,
per-user rate limiting, quota, spending cap, or audit trail. Those remain blocking
work in issues #12, #13, and #34.
