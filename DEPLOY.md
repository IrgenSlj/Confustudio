# Deploying CONFUstudio

CONFUstudio is a Node static + API server (`server.mjs`) that serves the PWA and an
optional AI proxy. It sets **COOP/COEP cross-origin-isolation headers** on every
response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are **required** — without them `SharedArrayBuffer` and the audio `AudioWorklet`
pipeline break. Any host you use MUST preserve them.

**TL;DR — one command to go live:**

```bash
fly launch --copy-config --now
```

(First time only; afterwards `fly deploy`.)

---

## Which hosts work?

| Host                 | Works? | Why                                                                                                                                               |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fly.io** (primary) | ✅     | Runs the Node server directly → COOP/COEP + AI proxy both work.                                                                                   |
| **Render** (alt)     | ✅     | Native Node runtime → same as above.                                                                                                              |
| Docker anywhere      | ✅     | Same server, in a container.                                                                                                                      |
| Netlify / Vercel     | ⚠️     | Can serve the static app _with_ headers via config, but the AI proxy API routes need a Node runtime (functions). Fly/Render are the real targets. |
| GitHub Pages         | ❌     | Cannot set COOP/COEP headers, no server for the API — audio worklets break.                                                                       |

The server binds `0.0.0.0` when `NODE_ENV=production` (and honours `$PORT`); locally
(`npm start`) it stays on `127.0.0.1:4173`. Cloud configs below set `NODE_ENV=production`.

---

## 1. Fly.io (primary)

Runs the Node server from the `Dockerfile`; `fly.toml` is already in the repo.

```bash
# once: install + sign in
brew install flyctl            # or: curl -L https://fly.io/install.sh | sh
fly auth login

# from the repo root — first deploy (creates the app, builds, ships):
fly launch --copy-config --now
```

`--copy-config` reuses the repo `fly.toml` (internal_port 4173, force HTTPS, health
check on `/`, machines auto-stop when idle / auto-start on request → near-zero cost for
a demo). `fly launch` may prompt to pick an app name / region — accept or change freely.

Subsequent deploys:

```bash
fly deploy
```

Then:

```bash
fly open          # opens https://<app>.fly.dev
fly logs          # tail logs
fly status        # machine state
```

**Custom domain** (optional):

```bash
fly certs add studio.example.com
# add the DNS record Fly prints (CNAME/A/AAAA); HTTPS cert is issued automatically.
```

---

## 2. Render (alternative, one-click Blueprint)

`render.yaml` defines a free Node web service (health check `/`, `NODE_ENV=production`,
Render injects `$PORT`).

- Push the repo to GitHub, then in the Render dashboard: **New → Blueprint**, pick the
  repo. Render reads `render.yaml` and provisions the service.
- Or use the Render CLI / "Deploy to Render" flow.

Render serves the app at `https://<name>.onrender.com`. (Free instances sleep when idle
and cold-start on the next request.)

---

## 3. Docker (local or any container host)

```bash
docker build -t confustudio .

# host port 8099 -> container 4173 (4173 may be busy locally):
docker run --rm -p 8099:4173 confustudio
# then open http://localhost:8099
```

Verify the isolation headers survive:

```bash
curl -I http://localhost:8099/
# expect: HTTP/1.1 200 OK
#         Cross-Origin-Opener-Policy: same-origin
#         Cross-Origin-Embedder-Policy: require-corp
```

The image has **no runtime npm dependencies** (the server uses only Node built-ins), so
the build is just a source copy — small and fast. It runs as the non-root `node` user.

---

## 4. Netlify / Vercel note (static-only path)

If you ever serve only the static front-end (no AI proxy), you can still get the
required headers:

**Netlify** — add a `_headers` file (or `netlify.toml`):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

**Vercel** — set the same two headers under `headers` in `vercel.json`.

⚠️ This only covers the static app. The `/api/assistant/*` and `/link` routes need the
Node server, so for the full app use Fly or Render.

---

## Environment variables

**The app works fully without any of these — AI assistance is entirely optional.**
Set them only to enable the in-app assistant proxy. Keep keys out of source (use the
host's secrets UI, e.g. `fly secrets set …` or the Render dashboard).

| Var                                        | Purpose                          | Default                                                |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------ |
| `PORT`                                     | Port to listen on                | `4173` (cloud hosts inject their own)                  |
| `HOST`                                     | Bind address                     | `0.0.0.0` when `NODE_ENV=production`, else `127.0.0.1` |
| `NODE_ENV`                                 | Set to `production` on hosts     | unset (local)                                          |
| `OPENAI_API_KEY`                           | Enable OpenAI assistant          | — (optional)                                           |
| `OPENAI_MODEL`                             | OpenAI model                     | `gpt-4.1-mini`                                         |
| `ANTHROPIC_API_KEY`                        | Enable Anthropic assistant       | — (optional)                                           |
| `ANTHROPIC_MODEL`                          | Anthropic model                  | `claude-3-5-sonnet-latest`                             |
| `LOCAL_AI_BASE_URL` / `ASSISTANT_BASE_URL` | Local OpenAI-compatible endpoint | — (optional)                                           |
| `OLLAMA_HOST`                              | Ollama endpoint                  | — (optional)                                           |
| `ASSISTANT_PROVIDER`                       | Force a default provider         | first configured, else `auto`                          |

Example (Fly, to enable AI):

```bash
fly secrets set OPENAI_API_KEY=sk-...
```
