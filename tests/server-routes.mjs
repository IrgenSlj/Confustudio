import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = [];
  const stderr = [];

  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for server start.\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`));
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
      reject(new Error(`Server exited before ready with code ${code}.\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`));
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
  const homeHtml = await home.text();
  assert(homeHtml.includes('CONFUstudio'), 'Home page does not contain studio branding');

  const manifest = await fetch(`${server.baseUrl}/public/manifest.webmanifest`);
  assert(manifest.ok, 'Manifest route failed', { status: manifest.status });
  const manifestJson = await readJson(manifest);
  assert(manifestJson.name === 'CONFUstudio', 'Manifest branding mismatch', manifestJson);

  const providersRes = await fetch(`${server.baseUrl}/api/assistant/providers`);
  assert(providersRes.ok, 'Assistant providers route failed', { status: providersRes.status });
  const providers = await readJson(providersRes);
  assert(providers.defaultProvider === 'auto', 'Assistant default provider should be auto in unconfigured env', providers);
  assert(Boolean(providers.providers?.openai), 'Assistant providers payload missing OpenAI provider', providers);

  const chatRes = await fetch(`${server.baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  });
  assert(chatRes.status === 503, 'Assistant chat should reject when no provider is configured', { status: chatRes.status });
  const chatJson = await readJson(chatRes);
  assert(chatJson.error === 'No assistant provider is configured', 'Assistant error payload mismatch', chatJson);

  const actionPlanRes = await fetch(`${server.baseUrl}/api/assistant/actions/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'make the drums punchier' }),
  });
  assert(actionPlanRes.status === 503, 'Assistant action planner should reject when no provider is configured', { status: actionPlanRes.status });
  const actionPlanJson = await readJson(actionPlanRes);
  assert(actionPlanJson.error === 'No assistant provider is configured', 'Assistant action planner error payload mismatch', actionPlanJson);

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
  assert(linkUpdate.bpm === 133 && linkUpdate.sourceId === 'server-test', 'Link state POST did not persist update', linkUpdate);

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
