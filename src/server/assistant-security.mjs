import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ASSISTANT_SESSION_COOKIE = 'confustudio_session';

const DAY_MS = 24 * 60 * 60 * 1000;

function policyError(message, code, statusCode, payload = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (payload) error.payload = payload;
  return error;
}

function boundedInteger(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isLoopbackHost(host) {
  const normalized = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.');
}

function constantTimeEqual(left, right) {
  const leftBuffer = createHash('sha256')
    .update(String(left || ''))
    .digest();
  const rightBuffer = createHash('sha256')
    .update(String(right || ''))
    .digest();
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator < 1) return [part, ''];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function normalizeConfiguredOrigins(raw, allowHttp) {
  const origins = new Set();
  for (const entry of String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    let url;
    try {
      url = new URL(entry);
    } catch (error) {
      throw new Error(`Invalid CONFUSTUDIO_ALLOWED_ORIGINS entry: ${entry}`, { cause: error });
    }
    if (url.origin !== entry.replace(/\/$/, '') || url.username || url.password) {
      throw new Error(`Allowed origins must be exact origins without paths or credentials: ${entry}`);
    }
    if (url.protocol !== 'https:' && !allowHttp) {
      throw new Error(`Public assistant origins must use HTTPS: ${entry}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Unsupported assistant origin protocol: ${entry}`);
    }
    origins.add(url.origin);
  }
  return origins;
}

function auditHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function estimateRequestBudget(body, config) {
  const inputPayload = {
    message: body?.message,
    messages: body?.messages,
    context: body?.context,
    model: body?.model,
    provider: body?.provider,
  };
  const inputBytes = Buffer.byteLength(JSON.stringify(inputPayload));
  const inputTokens = Math.max(1, Math.ceil(inputBytes / 4));
  const requestedOutput = boundedInteger(body?.maxTokens, 300, 1, config.maxOutputTokens);
  const totalTokens = inputTokens + requestedOutput;
  const estimatedCostMicros = Math.ceil(
    (inputTokens * config.inputMicrosPerMillion + requestedOutput * config.outputMicrosPerMillion) / 1_000_000,
  );
  return { inputTokens, outputTokens: requestedOutput, totalTokens, estimatedCostMicros };
}

export function createAssistantSecurity(options = {}) {
  const env = options.env || process.env;
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 4173);
  const now = options.now || (() => Date.now());
  const auditSink = options.auditSink || ((record) => console.log(`[security-audit] ${JSON.stringify(record)}`));
  const assistantEnabled = Boolean(options.assistantEnabled);
  const loopback = isLoopbackHost(host);
  const allowHttpOrigins = loopback || env.NODE_ENV === 'test';
  const configuredOrigins = normalizeConfiguredOrigins(env.CONFUSTUDIO_ALLOWED_ORIGINS, allowHttpOrigins);
  const accessToken = String(env.CONFUSTUDIO_ACCESS_TOKEN || '');

  if (assistantEnabled && !loopback) {
    if (accessToken.length < 32) {
      throw new Error('A non-loopback assistant requires CONFUSTUDIO_ACCESS_TOKEN with at least 32 characters');
    }
    if (configuredOrigins.size === 0) {
      throw new Error('A non-loopback assistant requires CONFUSTUDIO_ALLOWED_ORIGINS');
    }
  }

  const allowedOrigins = new Set(configuredOrigins);
  if (loopback) {
    allowedOrigins.add(`http://127.0.0.1:${port}`);
    allowedOrigins.add(`http://localhost:${port}`);
    allowedOrigins.add(`http://[::1]:${port}`);
  }

  const config = Object.freeze({
    sessionTtlMs: boundedInteger(env.CONFUSTUDIO_SESSION_TTL_MS, 12 * 60 * 60 * 1000, 60_000, 7 * DAY_MS),
    rateWindowMs: boundedInteger(env.CONFUSTUDIO_RATE_WINDOW_MS, 60_000, 1_000, 60 * 60 * 1000),
    rateLimit: boundedInteger(env.CONFUSTUDIO_RATE_LIMIT, 12, 1, 10_000),
    dailyRequestLimit: boundedInteger(env.CONFUSTUDIO_DAILY_REQUEST_LIMIT, 100, 1, 1_000_000),
    maxRequestTokens: boundedInteger(env.CONFUSTUDIO_MAX_REQUEST_TOKENS, 4096, 64, 1_000_000),
    maxOutputTokens: boundedInteger(env.CONFUSTUDIO_MAX_OUTPUT_TOKENS, 1024, 1, 100_000),
    upstreamTimeoutMs: boundedInteger(env.CONFUSTUDIO_UPSTREAM_TIMEOUT_MS, 30_000, 100, 60_000),
    dailyTokenLimit: boundedInteger(env.CONFUSTUDIO_DAILY_TOKEN_LIMIT, 100_000, 64, 100_000_000),
    dailyCostMicros: boundedInteger(env.CONFUSTUDIO_DAILY_COST_MICROS, 1_000_000, 1, 1_000_000_000),
    inputMicrosPerMillion: boundedInteger(env.CONFUSTUDIO_INPUT_MICROS_PER_MILLION, 10_000_000, 0, 1_000_000_000),
    outputMicrosPerMillion: boundedInteger(env.CONFUSTUDIO_OUTPUT_MICROS_PER_MILLION, 30_000_000, 0, 1_000_000_000),
  });

  const sessions = new Map();
  const principals = new Map();

  function writeAudit(event, outcome, details = {}) {
    const record = {
      timestamp: new Date(now()).toISOString(),
      event,
      outcome,
      ...(details.route ? { route: details.route } : {}),
      ...(details.principalId ? { principal: auditHash(details.principalId) } : {}),
      ...(details.code ? { code: details.code } : {}),
      ...(Number.isFinite(details.tokens) ? { tokens: details.tokens } : {}),
      ...(Number.isFinite(details.costMicros) ? { costMicros: details.costMicros } : {}),
      ...(details.provider ? { provider: String(details.provider).slice(0, 40) } : {}),
    };
    auditSink(record);
  }

  function reject(event, route, principalId, message, code, statusCode, payload = null) {
    writeAudit(event, 'denied', { route, principalId, code });
    throw policyError(message, code, statusCode, payload);
  }

  function assertOrigin(req, route, principalId = null) {
    const origin = String(req.headers.origin || '');
    if (!origin || !allowedOrigins.has(origin)) {
      reject('assistant.policy', route, principalId, 'Request origin is not allowed', 'ORIGIN_FORBIDDEN', 403);
    }
    return origin;
  }

  function pruneSessions() {
    const timestamp = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= timestamp) sessions.delete(id);
    }
    while (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
  }

  function issueSession(req) {
    const route = 'auth.session';
    assertOrigin(req, route);
    let principalId = 'loopback-development';
    if (!loopback) {
      const authorization = String(req.headers.authorization || '');
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!constantTimeEqual(supplied, accessToken)) {
        reject('assistant.session', route, null, 'Authentication is required', 'AUTHENTICATION_REQUIRED', 401);
      }
      principalId = `access:${auditHash(accessToken)}`;
    }

    pruneSessions();
    const id = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = now() + config.sessionTtlMs;
    sessions.set(id, { id, csrfToken, principalId, expiresAt });
    writeAudit('assistant.session', 'issued', { route, principalId });

    const attributes = [
      `${ASSISTANT_SESSION_COOKIE}=${encodeURIComponent(id)}`,
      'Path=/api/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`,
    ];
    if (!loopback) attributes.push('Secure');
    return {
      body: { authenticated: true, csrfToken, expiresAt, localDevelopment: loopback },
      headers: { 'Set-Cookie': attributes.join('; '), 'Cache-Control': 'no-store' },
    };
  }

  function authorizeMutation(req, route) {
    assertOrigin(req, route);
    const sessionId = parseCookies(req.headers.cookie)[ASSISTANT_SESSION_COOKIE];
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session || session.expiresAt <= now()) {
      if (sessionId) sessions.delete(sessionId);
      reject('assistant.policy', route, null, 'Authentication is required', 'AUTHENTICATION_REQUIRED', 401);
    }
    const suppliedCsrf = req.headers['x-csrf-token'];
    if (!constantTimeEqual(suppliedCsrf, session.csrfToken)) {
      reject('assistant.policy', route, session.principalId, 'CSRF token is invalid', 'CSRF_TOKEN_INVALID', 403);
    }
    return session;
  }

  function reserveRequest(session, body, route) {
    const timestamp = now();
    const principal = principals.get(session.principalId) || {
      day: Math.floor(timestamp / DAY_MS),
      requests: 0,
      tokens: 0,
      costMicros: 0,
      rateWindowStartedAt: timestamp,
      rateCount: 0,
    };
    const currentDay = Math.floor(timestamp / DAY_MS);
    if (principal.day !== currentDay) {
      principal.day = currentDay;
      principal.requests = 0;
      principal.tokens = 0;
      principal.costMicros = 0;
    }
    if (timestamp - principal.rateWindowStartedAt >= config.rateWindowMs) {
      principal.rateWindowStartedAt = timestamp;
      principal.rateCount = 0;
    }
    if (principal.rateCount >= config.rateLimit) {
      const retryAfterMs = config.rateWindowMs - (timestamp - principal.rateWindowStartedAt);
      reject('assistant.budget', route, session.principalId, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, {
        retryAfterMs,
      });
    }
    if (principal.requests >= config.dailyRequestLimit) {
      reject(
        'assistant.budget',
        route,
        session.principalId,
        'Daily request quota exceeded',
        'DAILY_REQUEST_QUOTA_EXCEEDED',
        429,
      );
    }

    const budget = estimateRequestBudget(body, config);
    if (budget.totalTokens > config.maxRequestTokens) {
      reject(
        'assistant.budget',
        route,
        session.principalId,
        'Request token budget exceeded',
        'REQUEST_TOKEN_BUDGET_EXCEEDED',
        413,
      );
    }
    if (principal.tokens + budget.totalTokens > config.dailyTokenLimit) {
      reject(
        'assistant.budget',
        route,
        session.principalId,
        'Daily token budget exceeded',
        'DAILY_TOKEN_BUDGET_EXCEEDED',
        429,
      );
    }
    if (principal.costMicros + budget.estimatedCostMicros > config.dailyCostMicros) {
      reject(
        'assistant.budget',
        route,
        session.principalId,
        'Daily spending budget exceeded',
        'DAILY_SPEND_BUDGET_EXCEEDED',
        429,
      );
    }

    principal.rateCount += 1;
    principal.requests += 1;
    principal.tokens += budget.totalTokens;
    principal.costMicros += budget.estimatedCostMicros;
    principals.set(session.principalId, principal);
    writeAudit('assistant.request', 'reserved', {
      route,
      principalId: session.principalId,
      tokens: budget.totalTokens,
      costMicros: budget.estimatedCostMicros,
      provider: body?.provider || 'auto',
    });
    return { ...budget, maxOutputTokens: budget.outputTokens };
  }

  function recordOutcome(session, route, outcome, details = {}) {
    writeAudit('assistant.request', outcome, {
      route,
      principalId: session?.principalId,
      code: details.code,
      provider: details.provider,
    });
  }

  return {
    config,
    isLoopback: loopback,
    allowedOrigins,
    issueSession,
    authorizeMutation,
    reserveRequest,
    recordOutcome,
    publicMetadata() {
      return {
        required: assistantEnabled,
        sessionEndpoint: '/api/auth/session',
        localDevelopmentBootstrap: loopback,
      };
    },
  };
}
