import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) error.details = details;
    throw error;
  }
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function startConfustudio(upstreamUrl) {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));

  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      OPENAI_API_KEY: 'BASELINE_FAKE_OPENAI_KEY',
      OPENAI_BASE_URL: upstreamUrl,
      ANTHROPIC_API_KEY: '',
      OLLAMA_HOST: '',
      LOCAL_AI_BASE_URL: '',
      ASSISTANT_BASE_URL: '',
      ASSISTANT_PROVIDER: 'openai',
      CONFUSTUDIO_ENABLE_ASSISTANT_PROXY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server start timed out.\n${stdout.join('')}\n${stderr.join('')}`));
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ready (${code}).\n${stdout.join('')}\n${stderr.join('')}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(2_000).then(() => child.kill('SIGKILL'))]);
    },
  };
}

let upstreamRequests = 0;
let leakedAuthorization = null;
const upstream = http.createServer((req, res) => {
  upstreamRequests += 1;
  leakedAuthorization = req.headers.authorization || null;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ output_text: 'unexpected request' }));
});
const upstreamPort = await listen(upstream);
const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;
const app = await startConfustudio(upstreamUrl);

try {
  const response = await fetch(`${app.baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      baseUrl: upstreamUrl,
      message: 'This request must not leave the process.',
    }),
  });
  const payload = await response.json();
  await delay(50);

  assert(response.status === 503, 'Disabled assistant proxy must return 503', {
    status: response.status,
    payload,
  });
  assert(payload.code === 'ASSISTANT_PROXY_DISABLED', 'Disabled proxy must return a stable error code', payload);
  assert(upstreamRequests === 0, 'Disabled proxy made an outbound request', { upstreamRequests });
  assert(leakedAuthorization === null, 'Disabled proxy leaked an authorization header', { leakedAuthorization });

  console.log(JSON.stringify({ ok: true, outboundRequests: upstreamRequests }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error.message,
        details: error.details || null,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await app.stop();
  await new Promise((resolve) => upstream.close(resolve));
}
