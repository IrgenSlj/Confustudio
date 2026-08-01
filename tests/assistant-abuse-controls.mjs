import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { createAssistantSecurity } from '../src/server/assistant-security.mjs';

const ACCESS_TOKEN = 'test-access-token-that-is-longer-than-32-characters';
const ALLOWED_ORIGIN = 'http://studio.test';
const SECRET_PROMPT = 'PROMPT_MUST_NOT_APPEAR_IN_AUDIT';

function assertCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `Expected policy error ${code}`);
}

async function reservePort() {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer(env = {}) {
  const port = await reservePort();
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: String(port),
      CONFUSTUDIO_ENABLE_ASSISTANT_PROXY: '1',
      CONFUSTUDIO_ACCESS_TOKEN: ACCESS_TOKEN,
      CONFUSTUDIO_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
      CONFUSTUDIO_RATE_LIMIT: '1',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      OLLAMA_HOST: '',
      LOCAL_AI_BASE_URL: '',
      ASSISTANT_BASE_URL: '',
      ASSISTANT_PROVIDER: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Server start timed out.\n${stdout.join('')}\n${stderr.join('')}`)),
      10_000,
    );
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`http://0.0.0.0:${port}`)) {
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
    logs: () => stdout.join(''),
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(2_000).then(() => child.kill('SIGKILL'))]);
    },
  };
}

async function readResponse(response) {
  return { response, payload: await response.json() };
}

function createDirectPolicy(env = {}, audits = []) {
  return createAssistantSecurity({
    host: '0.0.0.0',
    port: 4173,
    assistantEnabled: true,
    env: {
      NODE_ENV: 'test',
      CONFUSTUDIO_ACCESS_TOKEN: ACCESS_TOKEN,
      CONFUSTUDIO_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
      CONFUSTUDIO_RATE_LIMIT: '10',
      CONFUSTUDIO_DAILY_REQUEST_LIMIT: '100',
      CONFUSTUDIO_MAX_REQUEST_TOKENS: '4096',
      CONFUSTUDIO_MAX_OUTPUT_TOKENS: '1024',
      CONFUSTUDIO_DAILY_TOKEN_LIMIT: '100000',
      CONFUSTUDIO_DAILY_COST_MICROS: '1000000',
      ...env,
    },
    auditSink: (record) => audits.push(record),
  });
}

function authorizeDirect(policy) {
  const issued = policy.issueSession({
    headers: { origin: ALLOWED_ORIGIN, authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const cookie = issued.headers['Set-Cookie'].split(';', 1)[0];
  return policy.authorizeMutation(
    {
      headers: {
        origin: ALLOWED_ORIGIN,
        cookie,
        'x-csrf-token': issued.body.csrfToken,
      },
    },
    'assistant.chat',
  );
}

assert.throws(
  () =>
    createAssistantSecurity({
      host: '0.0.0.0',
      assistantEnabled: true,
      env: { NODE_ENV: 'test', CONFUSTUDIO_ALLOWED_ORIGINS: ALLOWED_ORIGIN },
    }),
  /CONFUSTUDIO_ACCESS_TOKEN/,
);
assert.throws(
  () =>
    createAssistantSecurity({
      host: '0.0.0.0',
      assistantEnabled: true,
      env: { NODE_ENV: 'test', CONFUSTUDIO_ACCESS_TOKEN: ACCESS_TOKEN },
    }),
  /CONFUSTUDIO_ALLOWED_ORIGINS/,
);

{
  const policy = createDirectPolicy({ CONFUSTUDIO_DAILY_REQUEST_LIMIT: '1' });
  const session = authorizeDirect(policy);
  policy.reserveRequest(session, { message: 'first', maxTokens: 1 }, 'assistant.chat');
  assertCode(
    () => policy.reserveRequest(session, { message: 'second', maxTokens: 1 }, 'assistant.chat'),
    'DAILY_REQUEST_QUOTA_EXCEEDED',
  );
}

{
  const policy = createDirectPolicy({ CONFUSTUDIO_MAX_REQUEST_TOKENS: '64' });
  const session = authorizeDirect(policy);
  assertCode(
    () => policy.reserveRequest(session, { message: 'x'.repeat(400), maxTokens: 1 }, 'assistant.chat'),
    'REQUEST_TOKEN_BUDGET_EXCEEDED',
  );
}

{
  const policy = createDirectPolicy({ CONFUSTUDIO_DAILY_TOKEN_LIMIT: '64' });
  const session = authorizeDirect(policy);
  policy.reserveRequest(session, { message: 'first', maxTokens: 30 }, 'assistant.chat');
  assertCode(
    () => policy.reserveRequest(session, { message: 'second', maxTokens: 30 }, 'assistant.chat'),
    'DAILY_TOKEN_BUDGET_EXCEEDED',
  );
}

{
  const audits = [];
  const policy = createDirectPolicy(
    {
      CONFUSTUDIO_DAILY_COST_MICROS: '1',
      CONFUSTUDIO_INPUT_MICROS_PER_MILLION: '1000000000',
      CONFUSTUDIO_OUTPUT_MICROS_PER_MILLION: '1000000000',
    },
    audits,
  );
  const session = authorizeDirect(policy);
  assertCode(
    () => policy.reserveRequest(session, { message: SECRET_PROMPT, maxTokens: 1 }, 'assistant.chat'),
    'DAILY_SPEND_BUDGET_EXCEEDED',
  );
  const serialized = JSON.stringify(audits);
  assert(!serialized.includes(ACCESS_TOKEN), 'Audit records exposed the access credential');
  assert(!serialized.includes(SECRET_PROMPT), 'Audit records exposed prompt content');
}

const app = await startServer();

try {
  const wrongOrigin = await readResponse(
    await fetch(`${app.baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { Origin: 'http://attacker.test', Authorization: `Bearer ${ACCESS_TOKEN}` },
    }),
  );
  assert.equal(wrongOrigin.response.status, 403);
  assert.equal(wrongOrigin.payload.code, 'ORIGIN_FORBIDDEN');

  const missingCredential = await readResponse(
    await fetch(`${app.baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    }),
  );
  assert.equal(missingCredential.response.status, 401);
  assert.equal(missingCredential.payload.code, 'AUTHENTICATION_REQUIRED');

  const login = await readResponse(
    await fetch(`${app.baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN, Authorization: `Bearer ${ACCESS_TOKEN}` },
    }),
  );
  assert.equal(login.response.status, 200);
  const setCookie = login.response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(';', 1)[0];

  const anonymous = await readResponse(
    await fetch(`${app.baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: SECRET_PROMPT }),
    }),
  );
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.payload.code, 'AUTHENTICATION_REQUIRED');

  const missingCsrf = await readResponse(
    await fetch(`${app.baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: SECRET_PROMPT }),
    }),
  );
  assert.equal(missingCsrf.response.status, 403);
  assert.equal(missingCsrf.payload.code, 'CSRF_TOKEN_INVALID');

  const authorizedHeaders = {
    Origin: ALLOWED_ORIGIN,
    Cookie: cookie,
    'X-CSRF-Token': login.payload.csrfToken,
    'Content-Type': 'application/json',
  };
  const invalidJson = await readResponse(
    await fetch(`${app.baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: '{invalid',
    }),
  );
  assert.equal(invalidJson.response.status, 400);
  assert.equal(invalidJson.payload.code, 'INVALID_JSON_BODY');

  const oversized = await readResponse(
    await fetch(`${app.baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ message: 'x'.repeat(132 * 1024) }),
    }),
  );
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.payload.code, 'REQUEST_BODY_TOO_LARGE');

  const first = await readResponse(
    await fetch(`${app.baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ message: SECRET_PROMPT }),
    }),
  );
  assert.equal(first.response.status, 503, 'Authenticated request should reach provider resolution');

  const rateLimited = await readResponse(
    await fetch(`${app.baseUrl}/api/assistant/chat`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ message: 'second request' }),
    }),
  );
  assert.equal(rateLimited.response.status, 429);
  assert.equal(rateLimited.payload.code, 'RATE_LIMIT_EXCEEDED');

  await delay(50);
  const logs = app.logs();
  assert(logs.includes('[security-audit]'), 'Server did not emit security audit events');
  assert(!logs.includes(ACCESS_TOKEN), 'Server audit logs exposed the access credential');
  assert(!logs.includes(SECRET_PROMPT), 'Server audit logs exposed prompt content');

  console.log(
    JSON.stringify(
      {
        ok: true,
        authentication: true,
        originAndCsrf: true,
        rateAndQuota: true,
        tokenAndSpendBudgets: true,
        auditRedaction: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || null }, null, 2));
  process.exitCode = 1;
} finally {
  await app.stop();
}
