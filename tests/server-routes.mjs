import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

import { buildManualToolSurface } from '../src/harness/tools/registry.js';

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) error.details = details;
    throw error;
  }
}

async function startServer() {
  const port = 4300 + Math.floor(Math.random() * 1000);
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      OLLAMA_HOST: '',
      LOCAL_AI_BASE_URL: '',
      ASSISTANT_BASE_URL: '',
      ASSISTANT_PROVIDER: '',
      CONFUSTUDIO_ENABLE_ASSISTANT_PROXY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = [];
  const stderr = [];

  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(`Timed out waiting for server start.\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`),
      );
    }, 10000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.includes(`CONFUstudio listening on http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Server exited before ready with code ${code}.\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`,
        ),
      );
    });
  });

  await ready;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([
        once(child, 'exit'),
        delay(2000).then(() => {
          child.kill('SIGKILL');
        }),
      ]);
    },
  };
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

const server = await startServer();

try {
  const home = await fetch(`${server.baseUrl}/`);
  assert(home.ok, 'Home route failed', { status: home.status });
  const expectedHeaders = {
    'content-security-policy':
      "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data: blob:; manifest-src 'self'; media-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:",
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), geolocation=(), microphone=(self), midi=(self), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
  for (const [name, value] of Object.entries(expectedHeaders)) {
    assert(home.headers.get(name) === value, `Security header mismatch: ${name}`, {
      expected: value,
      actual: home.headers.get(name),
    });
  }
  const homeHtml = await home.text();
  assert(homeHtml.includes('CONFUstudio'), 'Home page does not contain studio branding');

  const manifest = await fetch(`${server.baseUrl}/public/manifest.webmanifest`);
  assert(manifest.ok, 'Manifest route failed', { status: manifest.status });
  const manifestJson = await readJson(manifest);
  assert(manifestJson.name === 'CONFUstudio', 'Manifest branding mismatch', manifestJson);

  const providersRes = await fetch(`${server.baseUrl}/api/assistant/providers`);
  assert(providersRes.ok, 'Assistant providers route failed', { status: providersRes.status });
  const providers = await readJson(providersRes);
  assert(
    providers.defaultProvider === 'auto',
    'Assistant default provider should be auto in unconfigured env',
    providers,
  );
  assert(providers.assistantProxyEnabled === false, 'Assistant proxy must be disabled by default', providers);
  assert(Boolean(providers.providers?.openai), 'Assistant providers payload missing OpenAI provider', providers);
  assert(
    !Object.values(providers.providers).some((provider) => 'baseUrl' in provider),
    'Public provider catalog must not expose upstream URLs',
    providers,
  );

  // Health probe (used by container platforms — Fly/Render).
  const healthRes = await fetch(`${server.baseUrl}/healthz`);
  assert(healthRes.ok, 'Health route failed', { status: healthRes.status });
  const healthJson = await readJson(healthRes);
  assert(healthJson.ok === true, 'Health payload should report ok:true', healthJson);

  // Assistant context must expose the harness tool registry (commandTools),
  // generated at runtime → guarded against drift from the registry here.
  const contextRes = await fetch(`${server.baseUrl}/api/assistant/context`);
  assert(contextRes.ok, 'Assistant context route failed', { status: contextRes.status });
  const context = await readJson(contextRes);
  const expectedTools = buildManualToolSurface();
  assert(
    Array.isArray(context.commandTools) && context.commandTools.length === expectedTools.length,
    'Assistant context commandTools out of sync with the harness registry',
    { got: context.commandTools?.length, expected: expectedTools.length },
  );
  assert(
    context.commandTools.every((t) => t.name && t.parameters && Array.isArray(t.stations)),
    'commandTools entries must carry name, parameters, and stations',
    context.commandTools?.[0],
  );
  assert(context.assistantProxyEnabled === false, 'Assistant context must report the disabled proxy', context);

  const chatRes = await fetch(`${server.baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  });
  assert(chatRes.status === 503, 'Assistant chat should reject when no provider is configured', {
    status: chatRes.status,
  });
  const chatJson = await readJson(chatRes);
  assert(chatJson.code === 'ASSISTANT_PROXY_DISABLED', 'Assistant error payload mismatch', chatJson);

  const actionPlanRes = await fetch(`${server.baseUrl}/api/assistant/actions/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'make the drums punchier' }),
  });
  assert(actionPlanRes.status === 503, 'Assistant action planner should reject when no provider is configured', {
    status: actionPlanRes.status,
  });
  const actionPlanJson = await readJson(actionPlanRes);
  assert(
    actionPlanJson.code === 'ASSISTANT_PROXY_DISABLED',
    'Assistant action planner error payload mismatch',
    actionPlanJson,
  );

  const linkInitialRes = await fetch(`${server.baseUrl}/api/link/state`);
  assert(linkInitialRes.ok, 'Link state GET failed', { status: linkInitialRes.status });
  const linkInitial = await readJson(linkInitialRes);
  assert(typeof linkInitial.bpm === 'number', 'Link state missing bpm', linkInitial);

  const linkUpdateRes = await fetch(`${server.baseUrl}/api/link/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bpm: 133, sourceId: 'server-test', clockSource: 'link' }),
  });
  assert(linkUpdateRes.ok, 'Link state POST failed', { status: linkUpdateRes.status });
  const linkUpdate = await readJson(linkUpdateRes);
  assert(
    linkUpdate.bpm === 133 && linkUpdate.sourceId === 'server-test',
    'Link state POST did not persist update',
    linkUpdate,
  );

  const sseRes = await fetch(`${server.baseUrl}/link?clientId=test-client`);
  assert(sseRes.ok, 'Link SSE route failed', { status: sseRes.status });
  const reader = sseRes.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  const sseChunk = new TextDecoder().decode(value || new Uint8Array());
  assert(sseChunk.includes('event: message'), 'Link SSE response missing message event', { sseChunk });
  assert(sseChunk.includes('"clientId":"test-client"'), 'Link SSE response missing client id', { sseChunk });

  const notFound = await fetch(`${server.baseUrl}/does-not-exist`);
  assert(notFound.status === 404, 'Unknown route should return 404', { status: notFound.status });

  console.log(JSON.stringify({ ok: true, baseUrl: server.baseUrl }, null, 2));
} catch (error) {
  const payload = {
    ok: false,
    message: error.message,
    details: error.details || null,
    baseUrl: server.baseUrl,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
} finally {
  await server.stop();
}
