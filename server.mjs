import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildManualToolSurface } from './src/harness/tools/registry.js';
import { validateStudioCommandBatch } from './src/security/command-validation.js';
import { createAssistantSecurity } from './src/server/assistant-security.mjs';
import { createAssistantProxyError, postProviderJson, resolveProviderEndpoint } from './src/server/provider-egress.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const docsDir = path.join(rootDir, 'docs');
const port = Number(process.env.PORT || 4173);
// Bind loopback for local dev (safe default), but all interfaces in
// production so container platforms can route to us. HOST wins if set.
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const assistantProxyEnabled = ['1', 'true', 'yes'].includes(
  String(process.env.CONFUSTUDIO_ENABLE_ASSISTANT_PROXY || '').toLowerCase(),
);
const allowTestProviderOrigins =
  process.env.NODE_ENV === 'test' && process.env.CONFUSTUDIO_ALLOW_TEST_PROVIDER_ORIGINS === '1';
const assistantSecurity = createAssistantSecurity({
  host,
  port,
  assistantEnabled: assistantProxyEnabled,
});
const PROVIDER_ALIASES = {
  local: 'local-openai',
  'local-openai-compatible': 'local-openai',
  openai_compatible: 'local-openai',
  openaiCompatible: 'local-openai',
};
const assistantManualPath = path.join(docsDir, 'confustudio.manual.json');
const assistantSystemFallback =
  "You are the CONFUstudio assistant and production co-pilot. Translate the studio's real sequencing, sampling, synth, routing, scene, arrangement, and mix capabilities into concrete next actions the user can execute immediately.";
const assistantManual = loadAssistantManual();
const assistantProviderCatalog = buildProviderCatalog();
const defaultAssistantProvider = resolveDefaultAssistantProvider();
const linkClients = new Set();
const linkState = {
  bpm: 122,
  sourceId: 'server',
  clockSource: 'internal',
  updatedAt: Date.now(),
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

function buildFallbackManual() {
  return {
    schemaVersion: '1.0.0',
    app: {
      name: 'CONFUstudio',
      description:
        'Browser-first open-source digital music studio for sequencing, sampling, synthesis, routing, mixing, and mastering.',
    },
    assistant: {
      defaultRole: 'studio assistant',
      systemPrompt: assistantSystemFallback,
      contextSummary: 'CONFUstudio is a browser-first digital music studio with CONFUsynth as its flagship instrument.',
      skills: [],
      toolSurface: [],
    },
    manual: {
      pages: [],
      modules: [],
      audioAndControl: {},
      persistence: {},
      assistantGuardrails: [],
    },
    api: {
      endpoints: [],
      providerNotes: [],
    },
  };
}

function loadAssistantManual() {
  try {
    if (existsSync(assistantManualPath)) {
      return JSON.parse(readFileSync(assistantManualPath, 'utf8'));
    }
  } catch (error) {
    console.warn('[CONFUstudio] Failed to load assistant manual, using fallback:', error);
  }
  return buildFallbackManual();
}

function resolveDefaultAssistantProvider() {
  const configured = normalizeProviderName(process.env.ASSISTANT_PROVIDER);
  if (configured && assistantProviderCatalog[configured]?.configured) return configured;
  return getConfiguredAssistantProviderIds()[0] || 'auto';
}

function normalizeProviderName(provider) {
  if (!provider) return null;
  const lower = String(provider).trim().toLowerCase();
  return PROVIDER_ALIASES[lower] || lower;
}

function buildProviderCatalog() {
  const localBaseUrl =
    process.env.LOCAL_AI_BASE_URL || process.env.ASSISTANT_BASE_URL || process.env.OLLAMA_HOST || null;
  return {
    auto: {
      id: 'auto',
      label: 'Auto',
      description: 'Resolve to the first configured provider.',
      configured: true,
      default: true,
    },
    openai: {
      id: 'openai',
      label: 'OpenAI',
      transport: 'responses',
      scope: 'hosted',
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic',
      transport: 'messages',
      scope: 'hosted',
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    },
    'local-openai': {
      id: 'local-openai',
      label: 'Local OpenAI-compatible',
      transport: 'chat-completions',
      scope: 'local',
      configured: Boolean(process.env.LOCAL_AI_BASE_URL || process.env.ASSISTANT_BASE_URL),
      model: process.env.LOCAL_AI_MODEL || process.env.ASSISTANT_MODEL || 'local-model',
      baseUrl: localBaseUrl || 'http://127.0.0.1:1234/v1',
      apiKey: process.env.LOCAL_AI_API_KEY || null,
    },
    ollama: {
      id: 'ollama',
      label: 'Ollama',
      transport: 'ollama-chat',
      scope: 'local',
      configured: Boolean(process.env.OLLAMA_HOST),
      model: process.env.OLLAMA_MODEL || 'llama3.1',
      baseUrl: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    },
  };
}

function resolveAssistantConfig(requestedProvider) {
  const normalized = normalizeProviderName(requestedProvider) || defaultAssistantProvider;
  if (normalized === 'auto') {
    const preferredProvider = getConfiguredAssistantProviderIds()[0];
    return preferredProvider ? assistantProviderCatalog[preferredProvider] : null;
  }
  const provider = assistantProviderCatalog[normalized];
  if (!provider) {
    return null;
  }
  return provider;
}

function getConfiguredAssistantProviderIds() {
  return Object.values(assistantProviderCatalog)
    .filter((provider) => provider.id !== 'auto' && provider.configured)
    .map((provider) => provider.id);
}

function buildPublicProviderCatalog() {
  return Object.fromEntries(
    Object.values(assistantProviderCatalog).map((provider) => [
      provider.id,
      {
        id: provider.id,
        label: provider.label,
        ...(provider.transport ? { transport: provider.transport } : {}),
        configured: assistantProxyEnabled && Boolean(provider.configured),
        ...(provider.default ? { default: true } : {}),
      },
    ]),
  );
}

function buildAssistantSystemPrompt(bodyContext = null) {
  const assistant = assistantManual.assistant || {};
  const parts = [assistant.systemPrompt || assistantSystemFallback, assistant.contextSummary || ''].filter(Boolean);

  if (bodyContext && typeof bodyContext === 'object') {
    const contextLines = [];
    if (bodyContext.project?.name) contextLines.push(`Project: ${bodyContext.project.name}`);
    if (bodyContext.page) contextLines.push(`Page: ${bodyContext.page}`);
    if (bodyContext.track != null) contextLines.push(`Track: ${bodyContext.track}`);
    if (bodyContext.bank != null) contextLines.push(`Bank: ${bodyContext.bank}`);
    if (bodyContext.pattern != null) contextLines.push(`Pattern: ${bodyContext.pattern}`);
    if (bodyContext.summary) contextLines.push(`Summary: ${bodyContext.summary}`);
    if (contextLines.length > 0) {
      parts.push(`Live context:\n${contextLines.join('\n')}`);
    }
  }

  return parts.join('\n\n');
}

function buildAssistantContextEnvelope() {
  return {
    ...assistantManual,
    assistantProxyEnabled,
    providers: buildPublicProviderCatalog(),
    defaultProvider: defaultAssistantProvider,
    // Generated at runtime from the harness tool registry (src/harness/tools),
    // the single source of truth — the assistant's real studio capability
    // surface, always in sync with the command bus (no hand-maintained drift).
    commandTools: buildManualToolSurface(),
    endpoints: {
      session: '/api/auth/session',
      chat: '/api/assistant/chat',
      actions: '/api/assistant/actions/plan',
      context: '/api/assistant/context',
      providers: '/api/assistant/providers',
    },
    authentication: assistantSecurity.publicMetadata(),
  };
}

function normalizeAssistantMessages(body) {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages
      .filter((message) => message && typeof message === 'object')
      .map((message) => ({
        role: String(message.role || 'user'),
        content: normalizeMessageContent(message.content),
      }))
      .filter((message) => message.content);
  }

  if (typeof body.message === 'string' && body.message.trim()) {
    return [{ role: 'user', content: body.message.trim() }];
  }

  return [];
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        if (typeof entry.text === 'string') return entry.text;
        if (typeof entry.content === 'string') return entry.content;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim();
    if (typeof content.content === 'string') return content.content.trim();
  }
  return '';
}

function toOpenAIResponsesInput(systemPrompt, messages) {
  return [
    {
      role: 'system',
      content: [{ type: 'input_text', text: systemPrompt }],
    },
    ...messages.map((message) => ({
      role: message.role,
      content: [{ type: 'input_text', text: message.content }],
    })),
  ];
}

function toOpenAIChatMessages(systemPrompt, messages) {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ];
}

function toAnthropicMessages(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({ role: message.role, content: message.content }));
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const content = data?.output?.flatMap((item) => item?.content || []) || [];
  const text = content
    .map((entry) => entry?.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
  return text || 'No text response returned.';
}

function extractChatCompletionText(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text === 'string' && text.trim()) return text.trim();
  if (Array.isArray(text)) {
    return text
      .map((entry) => entry?.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return 'No text response returned.';
}

function extractAnthropicText(data) {
  const text = data?.content
    ?.map((item) => item?.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
  return text || 'No text response returned.';
}

function extractOllamaText(data) {
  const text = data?.message?.content;
  if (typeof text === 'string' && text.trim()) return text.trim();
  return 'No text response returned.';
}

function readJsonBody(req, maxBytes = 128 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error('Request body too large');
        error.statusCode = 413;
        error.code = 'REQUEST_BODY_TOO_LARGE';
        settled = true;
        chunks.length = 0;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (total === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        error.statusCode = 400;
        error.code = 'INVALID_JSON_BODY';
        reject(error);
      }
    });

    req.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

function providerResult(provider, model, text) {
  return {
    provider,
    model,
    text,
  };
}

function assertServerOwnedProviderConfiguration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createAssistantProxyError('Request body must be a JSON object', 'INVALID_REQUEST_BODY', 400);
  }
  const forbidden = ['baseUrl', 'apiKey'].filter((field) => Object.hasOwn(body, field));
  if (forbidden.length) {
    const error = createAssistantProxyError(
      'Provider destinations and credentials are configured on the server',
      'CLIENT_PROVIDER_CONFIG_FORBIDDEN',
      400,
    );
    error.payload = { forbiddenFields: forbidden };
    throw error;
  }
}

function createProviderStatusError(providerId, status) {
  return createAssistantProxyError(
    `Provider ${providerId} request failed with status ${status}`,
    'UPSTREAM_REQUEST_FAILED',
    502,
  );
}

function buildAssistantActionPlannerPrompt(bodyContext = null) {
  const base = buildAssistantSystemPrompt(bodyContext);
  return `${base}

You are producing bounded studio commands for CONFUstudio.
Return JSON only with this shape:
{"summary":"short summary","commands":[{"type":"command-type","...": "..."}]}

Allowed command types:
- set-project-meta
- set-transport
- set-pattern-length
- set-track-param
- set-step
- clear-track
- duplicate-pattern
- set-scene-name
- add-arranger-section
- generate-drum-pattern

Rules:
- Do not return markdown.
- Keep commands safe, concrete, and immediately executable.
- Prefer 1-6 commands.
- Use numeric indices for bankIndex, patternIndex, trackIndex, sceneIndex, and stepIndex.
- If the request is unclear, return {"summary":"Need clarification","commands":[]}.`;
}

function extractJsonObject(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {}
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (_) {}
  }
  return null;
}

async function requestAssistantProvider(body, systemPrompt) {
  assertServerOwnedProviderConfiguration(body);
  const providerConfig = resolveAssistantConfig(body.provider);
  const messages = normalizeAssistantMessages(body);
  const temperatureValue = Number(body.temperature);
  const maxTokensValue = Number(body.maxTokens);
  const temperature = Number.isFinite(temperatureValue) ? Math.max(0, Math.min(2, temperatureValue)) : 0.7;
  const maxTokens = Number.isFinite(maxTokensValue)
    ? Math.max(1, Math.min(assistantSecurity.config.maxOutputTokens, Math.floor(maxTokensValue)))
    : 300;

  if (!providerConfig) {
    const requestedProvider = normalizeProviderName(body.provider) || 'auto';
    const error = new Error(
      requestedProvider === 'auto' ? 'No assistant provider is configured' : `Unknown provider: ${body.provider}`,
    );
    error.statusCode = requestedProvider === 'auto' ? 503 : 400;
    error.payload = {
      providers: Object.keys(assistantProviderCatalog),
      configuredProviders: getConfiguredAssistantProviderIds(),
    };
    throw error;
  }

  if (body.model !== undefined && body.model !== null && body.model !== providerConfig.model) {
    throw createAssistantProxyError('Assistant models are configured on the server', 'PROVIDER_MODEL_FORBIDDEN', 400);
  }

  if (messages.length === 0) {
    const error = new Error('message or messages is required');
    error.statusCode = 400;
    throw error;
  }

  if (providerConfig.id === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      const error = new Error('OPENAI_API_KEY is not configured');
      error.statusCode = 400;
      throw error;
    }

    const endpoint = await resolveProviderEndpoint(providerConfig, 'v1/responses', {
      allowTestProviderOrigins,
    });
    const { response, data } = await postProviderJson(
      endpoint,
      {
        model: providerConfig.model,
        input: toOpenAIResponsesInput(systemPrompt, messages),
        temperature,
        max_output_tokens: maxTokens,
      },
      {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      { timeoutMs: assistantSecurity.config.upstreamTimeoutMs },
    );

    if (!response.ok) {
      throw createProviderStatusError(providerConfig.id, response.status);
    }

    return providerResult(providerConfig.id, providerConfig.model, extractOpenAIText(data));
  }

  if (providerConfig.id === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      const error = new Error('ANTHROPIC_API_KEY is not configured');
      error.statusCode = 400;
      throw error;
    }

    const endpoint = await resolveProviderEndpoint(providerConfig, 'v1/messages', {
      allowTestProviderOrigins,
    });
    const { response, data } = await postProviderJson(
      endpoint,
      {
        model: providerConfig.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: toAnthropicMessages(messages),
      },
      {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      { timeoutMs: assistantSecurity.config.upstreamTimeoutMs },
    );

    if (!response.ok) {
      throw createProviderStatusError(providerConfig.id, response.status);
    }

    return providerResult(providerConfig.id, providerConfig.model, extractAnthropicText(data));
  }

  if (providerConfig.id === 'local-openai') {
    const endpoint = await resolveProviderEndpoint(providerConfig, 'chat/completions', {
      allowTestProviderOrigins,
    });
    const { response, data } = await postProviderJson(
      endpoint,
      {
        model: providerConfig.model,
        messages: toOpenAIChatMessages(systemPrompt, messages),
        temperature,
        max_tokens: maxTokens,
      },
      providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {},
      { timeoutMs: assistantSecurity.config.upstreamTimeoutMs },
    );

    if (!response.ok) {
      throw createProviderStatusError(providerConfig.id, response.status);
    }

    return providerResult(providerConfig.id, providerConfig.model, extractChatCompletionText(data));
  }

  if (providerConfig.id === 'ollama') {
    const endpoint = await resolveProviderEndpoint(providerConfig, 'api/chat', {
      allowTestProviderOrigins,
    });
    const { response, data } = await postProviderJson(
      endpoint,
      {
        model: providerConfig.model,
        messages: toOpenAIChatMessages(systemPrompt, messages),
        options: {
          temperature,
          num_predict: maxTokens,
        },
        stream: false,
      },
      {},
      { timeoutMs: assistantSecurity.config.upstreamTimeoutMs },
    );

    if (!response.ok) {
      throw createProviderStatusError(providerConfig.id, response.status);
    }

    return providerResult(providerConfig.id, providerConfig.model, extractOllamaText(data));
  }

  const error = new Error(`Provider transport not implemented: ${providerConfig.id}`);
  error.statusCode = 501;
  throw error;
}

async function handleAssistantContext(_req, res) {
  sendJson(res, 200, buildAssistantContextEnvelope());
}

async function handleAssistantProviders(_req, res) {
  sendJson(res, 200, {
    assistantProxyEnabled,
    defaultProvider: defaultAssistantProvider,
    providers: buildPublicProviderCatalog(),
    authentication: assistantSecurity.publicMetadata(),
  });
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join('; ');

// Shared by HTML, assets, APIs, and errors so no route silently loses policy.
const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self), midi=(self), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function handleAssistantSession(req, res) {
  try {
    const session = assistantSecurity.issueSession(req);
    sendJson(res, 200, session.body, session.headers);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.payload || {}),
    });
  }
}

function rejectDisabledAssistantProxy(res) {
  sendJson(res, 503, {
    error: 'Assistant proxy is disabled',
    code: 'ASSISTANT_PROXY_DISABLED',
  });
}

function writeSse(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastLinkState() {
  const payload = { ...linkState };
  for (const client of [...linkClients]) {
    try {
      writeSse(client, 'message', payload);
    } catch (_) {
      linkClients.delete(client);
    }
  }
}

async function handleLinkStream(req, res, url) {
  const clientId = url.searchParams.get('clientId') || `link-${Math.random().toString(36).slice(2, 10)}`;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    ...SECURITY_HEADERS,
  });
  res.write(': connected\n\n');
  writeSse(res, 'message', { ...linkState, clientId, connected: true });
  linkClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      clearInterval(heartbeat);
      linkClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    linkClients.delete(res);
  });
}

async function handleLinkState(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, linkState);
      return;
    }

    const body = await readJsonBody(req, 32 * 1024);
    const bpm = Math.max(40, Math.min(240, Number(body.bpm) || linkState.bpm || 122));
    linkState.bpm = bpm;
    linkState.sourceId = typeof body.sourceId === 'string' && body.sourceId.trim() ? body.sourceId.trim() : 'server';
    linkState.clockSource =
      typeof body.clockSource === 'string' && body.clockSource.trim() ? body.clockSource.trim() : 'internal';
    linkState.updatedAt = Date.now();
    broadcastLinkState();
    sendJson(res, 200, { ok: true, ...linkState });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

async function serveFile(res, filePath) {
  if (!existsSync(filePath)) {
    res.writeHead(404, SECURITY_HEADERS);
    res.end('Not found');
    return;
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    res.writeHead(403, SECURITY_HEADERS);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  createReadStream(filePath).pipe(res);
}

async function handleAssistant(req, res) {
  let session = null;
  try {
    session = assistantSecurity.authorizeMutation(req, 'assistant.chat');
    const body = await readJsonBody(req);
    const budget = assistantSecurity.reserveRequest(session, body, 'assistant.chat');
    body.maxTokens = budget.maxOutputTokens;
    assertServerOwnedProviderConfiguration(body);
    const result = await requestAssistantProvider(body, buildAssistantSystemPrompt(body.context));
    assistantSecurity.recordOutcome(session, 'assistant.chat', 'succeeded', { provider: result.provider });
    sendJson(res, 200, result);
  } catch (error) {
    if (session) {
      assistantSecurity.recordOutcome(session, 'assistant.chat', 'failed', { code: error.code });
    }
    sendJson(res, error.statusCode || 500, {
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.payload || {}),
    });
  }
}

async function handleAssistantActionPlan(req, res) {
  let session = null;
  try {
    session = assistantSecurity.authorizeMutation(req, 'assistant.actions.plan');
    const body = await readJsonBody(req);
    const budget = assistantSecurity.reserveRequest(session, body, 'assistant.actions.plan');
    body.maxTokens = budget.maxOutputTokens;
    assertServerOwnedProviderConfiguration(body);
    body.message = typeof body.message === 'string' ? body.message : '';
    body.messages = [{ role: 'user', content: body.message }];
    const result = await requestAssistantProvider(body, buildAssistantActionPlannerPrompt(body.context));
    const plan = extractJsonObject(result.text);
    if (!plan || typeof plan !== 'object') {
      sendJson(res, 502, {
        error: 'Assistant action planner returned invalid JSON',
        provider: result.provider,
        model: result.model,
        text: result.text,
      });
      return;
    }
    const commands = Array.isArray(plan.commands) ? plan.commands : [];
    try {
      validateStudioCommandBatch(commands, { maxCommands: 24 });
    } catch (_) {
      throw createAssistantProxyError(
        'Assistant action planner returned invalid commands',
        'ASSISTANT_COMMANDS_INVALID',
        502,
      );
    }
    assistantSecurity.recordOutcome(session, 'assistant.actions.plan', 'succeeded', { provider: result.provider });
    sendJson(res, 200, {
      provider: result.provider,
      model: result.model,
      summary: typeof plan.summary === 'string' ? plan.summary : '',
      commands,
      text: result.text,
    });
  } catch (error) {
    if (session) {
      assistantSecurity.recordOutcome(session, 'assistant.actions.plan', 'failed', { code: error.code });
    }
    sendJson(res, error.statusCode || 500, {
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.payload || {}),
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Liveness probe for container platforms (Fly/Render/Railway). Cheap and
  // dependency-free — returns before any file or upstream work.
  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true, service: 'confustudio' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/session') {
    if (!assistantProxyEnabled) {
      rejectDisabledAssistantProxy(res);
      return;
    }
    handleAssistantSession(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/assistant/chat') {
    if (!assistantProxyEnabled) {
      rejectDisabledAssistantProxy(res);
      return;
    }
    await handleAssistant(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/assistant/actions/plan') {
    if (!assistantProxyEnabled) {
      rejectDisabledAssistantProxy(res);
      return;
    }
    await handleAssistantActionPlan(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/assistant/context') {
    await handleAssistantContext(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/assistant/providers') {
    await handleAssistantProviders(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/link') {
    handleLinkStream(req, res, url);
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/link/state') {
    await handleLinkState(req, res);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    await serveFile(res, path.join(rootDir, 'index.html'));
    return;
  }

  if (url.pathname === '/sw.js') {
    await serveFile(res, path.join(publicDir, 'sw.js'));
    return;
  }

  if (url.pathname.startsWith('/src/')) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (url.pathname.startsWith('/docs/')) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (url.pathname.startsWith('/public/')) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/samples') {
    const samplesDir = path.join(rootDir, 'samples');
    const audioExts = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff']);
    try {
      const entries = await readdir(samplesDir);
      const results = [];
      for (const name of entries) {
        if (!audioExts.has(path.extname(name).toLowerCase())) continue;
        try {
          const fileStat = await stat(path.join(samplesDir, name));
          if (fileStat.isFile()) {
            results.push({ name, path: `/samples/${name}`, size: fileStat.size });
          }
        } catch (_) {}
      }
      sendJson(res, 200, results);
    } catch (_) {
      sendJson(res, 200, []);
    }
    return;
  }

  if (url.pathname.startsWith('/samples/')) {
    const filename = path.basename(url.pathname);
    await serveFile(res, path.join(rootDir, 'samples', filename));
    return;
  }

  res.writeHead(404, SECURITY_HEADERS);
  res.end('Not found');
});

server.listen(port, host, () => {
  console.log(`CONFUstudio listening on http://${host}:${port}`);
  // A loopback bind is treated as development: /api/auth/session issues a
  // session with no access credential. Origin is the only remaining gate, and
  // any non-browser client sets that freely — so fronting this bind with a
  // reverse proxy exposes an UNAUTHENTICATED assistant to whoever reaches it.
  if (assistantProxyEnabled && assistantSecurity.isLoopback) {
    console.warn(
      '[CONFUstudio] Assistant proxy is enabled on a loopback bind and issues sessions WITHOUT a credential. ' +
        'Do not place a reverse proxy or port forward in front of this process. ' +
        'For any non-loopback exposure, bind non-loopback so CONFUSTUDIO_ACCESS_TOKEN and CONFUSTUDIO_ALLOWED_ORIGINS are enforced.',
    );
  }
});
