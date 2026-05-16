const ASSISTANT_API_ROOT = '/api/assistant';

let cachedContextPromise = null;
let cachedProvidersPromise = null;

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${ASSISTANT_API_ROOT}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data?.error || `Assistant request failed with ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function fetchAssistantContext(forceRefresh = false) {
  if (!forceRefresh && cachedContextPromise) {
    return cachedContextPromise;
  }

  cachedContextPromise = requestJson('/context');
  return cachedContextPromise;
}

export async function fetchAssistantProviders(forceRefresh = false) {
  if (!forceRefresh && cachedProvidersPromise) {
    return cachedProvidersPromise;
  }

  cachedProvidersPromise = requestJson('/providers');
  return cachedProvidersPromise;
}

export async function chatAssistant(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('payload must be an object');
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const messages = Array.isArray(payload.messages) ? payload.messages : undefined;

  if (!message && (!messages || messages.length === 0)) {
    throw new TypeError('message or messages is required');
  }

  return requestJson('/chat', {
    method: 'POST',
    body: JSON.stringify({
      provider: payload.provider || 'auto',
      message: message || undefined,
      messages,
      context: payload.context || undefined,
      model: payload.model || undefined,
      baseUrl: payload.baseUrl || undefined,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
    }),
  });
}

export async function planAssistantActions(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('payload must be an object');
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    throw new TypeError('message is required');
  }

  return requestJson('/actions/plan', {
    method: 'POST',
    body: JSON.stringify({
      provider: payload.provider || 'auto',
      message,
      context: payload.context || undefined,
      model: payload.model || undefined,
      baseUrl: payload.baseUrl || undefined,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      apiKey: payload.apiKey,
    }),
  });
}

export function buildAssistantPrompt(context = {}) {
  const lines = [];

  if (context.project?.name) lines.push(`Project: ${context.project.name}`);
  if (context.page) lines.push(`Page: ${context.page}`);
  if (context.track != null) lines.push(`Track: ${context.track}`);
  if (context.bank != null) lines.push(`Bank: ${context.bank}`);
  if (context.pattern != null) lines.push(`Pattern: ${context.pattern}`);
  if (context.summary) lines.push(`Summary: ${context.summary}`);

  return lines.join('\n');
}

export function installAssistantBridge(target = typeof window !== 'undefined' ? window : globalThis) {
  if (!target) return null;

  const api = {
    fetchContext: fetchAssistantContext,
    fetchProviders: fetchAssistantProviders,
    chat: chatAssistant,
    planActions: planAssistantActions,
    buildPrompt: buildAssistantPrompt,
  };

  target.confustudioAssistant = api;
  target.confusynthAssistant = api;
  return api;
}

if (typeof window !== 'undefined') {
  installAssistantBridge(window);
}

export default {
  fetchAssistantContext,
  fetchAssistantProviders,
  chatAssistant,
  planAssistantActions,
  buildAssistantPrompt,
  installAssistantBridge,
};
