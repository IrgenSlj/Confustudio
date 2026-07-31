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

async function reservePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startConfustudio(env = {}) {
  const port = await reservePort();
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      OPENAI_API_KEY: '',
      OPENAI_BASE_URL: '',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_BASE_URL: '',
      OLLAMA_HOST: '',
      LOCAL_AI_BASE_URL: '',
      LOCAL_AI_API_KEY: '',
      ASSISTANT_BASE_URL: '',
      ASSISTANT_PROVIDER: '',
      CONFUSTUDIO_ENABLE_ASSISTANT_PROXY: '1',
      CONFUSTUDIO_ALLOW_TEST_PROVIDER_ORIGINS: '',
      ...env,
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

async function requestAssistant(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

let upstreamMode = 'success';
const upstreamRequests = [];
const upstream = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  upstreamRequests.push({
    path: req.url,
    authorization: req.headers.authorization || null,
    anthropicApiKey: req.headers['x-api-key'] || null,
    body: Buffer.concat(chunks).toString('utf8'),
  });

  if (upstreamMode === 'redirect') {
    res.writeHead(307, { Location: attackerUrl });
    res.end();
    return;
  }
  if (upstreamMode === 'oversized') {
    const oversized = 'x'.repeat(1024 * 1024 + 1);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(oversized) });
    res.end(oversized);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify(
      req.url === '/v1/messages'
        ? { content: [{ type: 'text', text: 'normalized anthropic response' }], internal_debug: 'hidden' }
        : req.url === '/v1/chat/completions'
          ? { choices: [{ message: { content: 'normalized local response' } }], internal_debug: 'hidden' }
          : { output_text: 'normalized response', internal_debug: 'must not reach browser' },
    ),
  );
});
const upstreamPort = await listen(upstream);
const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

let attackerRequests = 0;
const attacker = http.createServer((_req, res) => {
  attackerRequests += 1;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ output_text: 'attacker response' }));
});
const attackerPort = await listen(attacker);
const attackerUrl = `http://127.0.0.1:${attackerPort}/collect`;

let configuredApp;
let privateHostedApp;
let privateMappedHostedApp;
let remoteLocalApp;

try {
  configuredApp = await startConfustudio({
    NODE_ENV: 'test',
    CONFUSTUDIO_ALLOW_TEST_PROVIDER_ORIGINS: '1',
    OPENAI_API_KEY: 'SERVER_OWNED_TEST_CREDENTIAL',
    OPENAI_BASE_URL: upstreamUrl,
    OPENAI_MODEL: 'test-model',
    ANTHROPIC_API_KEY: 'SERVER_OWNED_ANTHROPIC_TEST_CREDENTIAL',
    ANTHROPIC_BASE_URL: upstreamUrl,
    ANTHROPIC_MODEL: 'test-anthropic-model',
    LOCAL_AI_BASE_URL: `${upstreamUrl}/v1`,
    LOCAL_AI_API_KEY: 'SERVER_OWNED_LOCAL_TEST_CREDENTIAL',
    LOCAL_AI_MODEL: 'test-local-model',
    ASSISTANT_PROVIDER: 'openai',
  });

  const providersResponse = await fetch(`${configuredApp.baseUrl}/api/assistant/providers`);
  const providers = await providersResponse.json();
  assert(providers.assistantProxyEnabled === true, 'Configured test proxy should be enabled', providers);
  assert(providers.providers.openai.configured === true, 'OpenAI should be reported configured', providers);
  assert(!('baseUrl' in providers.providers.openai), 'Provider metadata exposed the configured destination', providers);

  const success = await requestAssistant(configuredApp.baseUrl, {
    provider: 'openai',
    message: 'Return a normalized response.',
  });
  assert(success.response.ok, 'Configured hosted provider request failed', success.payload);
  assert(
    JSON.stringify(success.payload) ===
      JSON.stringify({ provider: 'openai', model: 'test-model', text: 'normalized response' }),
    'Browser response was not normalized',
    success.payload,
  );
  assert(upstreamRequests.length === 1, 'Configured upstream did not receive exactly one request', upstreamRequests);
  assert(upstreamRequests[0].path === '/v1/responses', 'Hosted provider path was not fixed', upstreamRequests[0]);
  assert(
    upstreamRequests[0].authorization === 'Bearer SERVER_OWNED_TEST_CREDENTIAL',
    'Server credential was not sent to the configured upstream',
    upstreamRequests[0],
  );

  const anthropicSuccess = await requestAssistant(configuredApp.baseUrl, {
    provider: 'anthropic',
    message: 'Return a normalized Anthropic response.',
  });
  assert(anthropicSuccess.response.ok, 'Configured Anthropic request failed', anthropicSuccess.payload);
  assert(
    JSON.stringify(anthropicSuccess.payload) ===
      JSON.stringify({
        provider: 'anthropic',
        model: 'test-anthropic-model',
        text: 'normalized anthropic response',
      }),
    'Anthropic browser response was not normalized',
    anthropicSuccess.payload,
  );
  assert(upstreamRequests[1].path === '/v1/messages', 'Anthropic provider path was not fixed', upstreamRequests[1]);
  assert(
    upstreamRequests[1].anthropicApiKey === 'SERVER_OWNED_ANTHROPIC_TEST_CREDENTIAL',
    'Anthropic credential was not sent only to the configured upstream',
    upstreamRequests[1],
  );

  const localSuccess = await requestAssistant(configuredApp.baseUrl, {
    provider: 'local-openai',
    message: 'Return a normalized local response.',
  });
  assert(localSuccess.response.ok, 'Configured loopback provider request failed', localSuccess.payload);
  assert(
    JSON.stringify(localSuccess.payload) ===
      JSON.stringify({ provider: 'local-openai', model: 'test-local-model', text: 'normalized local response' }),
    'Local browser response was not normalized',
    localSuccess.payload,
  );
  assert(upstreamRequests[2].path === '/v1/chat/completions', 'Local provider path was not fixed', upstreamRequests[2]);
  assert(
    upstreamRequests[2].authorization === 'Bearer SERVER_OWNED_LOCAL_TEST_CREDENTIAL',
    'Local credential was not read from server configuration',
    upstreamRequests[2],
  );

  const beforeOverride = upstreamRequests.length;
  const override = await requestAssistant(configuredApp.baseUrl, {
    provider: 'openai',
    baseUrl: attackerUrl,
    apiKey: 'CLIENT_CONTROLLED_KEY',
    message: 'Attempt destination override.',
  });
  assert(override.response.status === 400, 'Client provider configuration should be rejected', override.payload);
  assert(
    override.payload.code === 'CLIENT_PROVIDER_CONFIG_FORBIDDEN',
    'Missing stable override error',
    override.payload,
  );
  assert(upstreamRequests.length === beforeOverride, 'Override request reached configured upstream', upstreamRequests);
  assert(attackerRequests === 0, 'Override request reached attacker destination', { attackerRequests });

  upstreamMode = 'redirect';
  const redirected = await requestAssistant(configuredApp.baseUrl, {
    provider: 'openai',
    message: 'Do not follow redirects.',
  });
  assert(redirected.response.status === 502, 'Provider redirect should fail closed', redirected.payload);
  assert(redirected.payload.code === 'UPSTREAM_REDIRECT_REJECTED', 'Missing redirect error code', redirected.payload);
  assert(attackerRequests === 0, 'Provider redirect reached attacker destination', { attackerRequests });

  upstreamMode = 'oversized';
  const oversized = await requestAssistant(configuredApp.baseUrl, {
    provider: 'openai',
    message: 'Reject oversized responses.',
  });
  assert(oversized.response.status === 502, 'Oversized provider response should fail closed', oversized.payload);
  assert(
    oversized.payload.code === 'UPSTREAM_RESPONSE_TOO_LARGE',
    'Missing response-size error code',
    oversized.payload,
  );

  privateHostedApp = await startConfustudio({
    NODE_ENV: 'development',
    OPENAI_API_KEY: 'SERVER_OWNED_TEST_CREDENTIAL',
    OPENAI_BASE_URL: 'https://127.0.0.1:65535',
    ASSISTANT_PROVIDER: 'openai',
  });
  const privateHosted = await requestAssistant(privateHostedApp.baseUrl, {
    provider: 'openai',
    message: 'Reject private hosted destinations.',
  });
  assert(privateHosted.response.status === 502, 'Private hosted destination should be rejected', privateHosted.payload);
  assert(
    privateHosted.payload.code === 'PROVIDER_DESTINATION_FORBIDDEN',
    'Missing private-host error',
    privateHosted.payload,
  );

  privateMappedHostedApp = await startConfustudio({
    NODE_ENV: 'development',
    OPENAI_API_KEY: 'SERVER_OWNED_TEST_CREDENTIAL',
    OPENAI_BASE_URL: 'https://[::ffff:7f00:1]:65535',
    ASSISTANT_PROVIDER: 'openai',
  });
  const privateMappedHosted = await requestAssistant(privateMappedHostedApp.baseUrl, {
    provider: 'openai',
    message: 'Reject IPv4-mapped private hosted destinations.',
  });
  assert(
    privateMappedHosted.response.status === 502,
    'IPv4-mapped private destination should be rejected',
    privateMappedHosted.payload,
  );
  assert(
    privateMappedHosted.payload.code === 'PROVIDER_DESTINATION_FORBIDDEN',
    'Missing IPv4-mapped private-host error',
    privateMappedHosted.payload,
  );

  remoteLocalApp = await startConfustudio({
    NODE_ENV: 'development',
    LOCAL_AI_BASE_URL: 'https://example.com/v1',
    ASSISTANT_PROVIDER: 'local-openai',
  });
  const remoteLocal = await requestAssistant(remoteLocalApp.baseUrl, {
    provider: 'local-openai',
    message: 'Reject non-loopback local providers.',
  });
  assert(
    remoteLocal.response.status === 502,
    'Remote local-provider destination should be rejected',
    remoteLocal.payload,
  );
  assert(
    remoteLocal.payload.code === 'LOCAL_PROVIDER_DESTINATION_FORBIDDEN',
    'Missing local-provider destination error',
    remoteLocal.payload,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        configuredUpstreamRequests: upstreamRequests.length,
        attackerRequests,
        normalizedResponse: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || null }, null, 2));
  process.exitCode = 1;
} finally {
  await configuredApp?.stop();
  await privateHostedApp?.stop();
  await privateMappedHostedApp?.stop();
  await remoteLocalApp?.stop();
  await Promise.all([
    new Promise((resolve) => upstream.close(resolve)),
    new Promise((resolve) => attacker.close(resolve)),
  ]);
}
