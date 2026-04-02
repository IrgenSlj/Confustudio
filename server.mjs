import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const srcDir = path.join(rootDir, "src");
const docsDir = path.join(rootDir, "docs");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const assistantManualPath = path.join(docsDir, "confusynth.manual.json");
const assistantSystemFallback = "You are a concise music production assistant for a hybrid sampler-sequencer prototype. Focus on sound design, sequencing suggestions, and workflow ideas.";
const assistantManual = loadAssistantManual();
const assistantProviderCatalog = buildProviderCatalog();
const defaultAssistantProvider = resolveDefaultAssistantProvider();
const linkClients = new Set();
const linkState = {
  bpm: 122,
  sourceId: "server",
  clockSource: "internal",
  updatedAt: Date.now(),
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac"
};

const PROVIDER_ALIASES = {
  local: "local-openai",
  "local-openai-compatible": "local-openai",
  openai_compatible: "local-openai",
  openaiCompatible: "local-openai",
};

function buildFallbackManual() {
  return {
    schemaVersion: "1.0.0",
    app: {
      name: "CONFUsynth",
      description: "Browser-first open-source digital music studio for sequencing, sampling, synthesis, routing, mixing, and mastering.",
    },
    assistant: {
      defaultRole: "studio assistant",
      systemPrompt: assistantSystemFallback,
      contextSummary: "CONFUsynth is a browser-first digital music studio.",
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
      return JSON.parse(readFileSync(assistantManualPath, "utf8"));
    }
  } catch (error) {
    console.warn("[CONFUsynth] Failed to load assistant manual, using fallback:", error);
  }
  return buildFallbackManual();
}

function resolveDefaultAssistantProvider() {
  const configured = normalizeProviderName(process.env.ASSISTANT_PROVIDER);
  if (configured) return configured;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_HOST || process.env.LOCAL_AI_BASE_URL || process.env.ASSISTANT_BASE_URL) return "local-openai";
  return "openai";
}

function normalizeProviderName(provider) {
  if (!provider) return null;
  const lower = String(provider).trim().toLowerCase();
  return PROVIDER_ALIASES[lower] || lower;
}

function buildProviderCatalog() {
  const localBaseUrl = process.env.LOCAL_AI_BASE_URL || process.env.ASSISTANT_BASE_URL || process.env.OLLAMA_HOST || null;
  return {
    auto: {
      id: "auto",
      label: "Auto",
      description: "Resolve to the first configured provider.",
      configured: true,
      default: true,
    },
    openai: {
      id: "openai",
      label: "OpenAI",
      transport: "responses",
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
    },
    anthropic: {
      id: "anthropic",
      label: "Anthropic",
      transport: "messages",
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    },
    "local-openai": {
      id: "local-openai",
      label: "Local OpenAI-compatible",
      transport: "chat-completions",
      configured: Boolean(process.env.LOCAL_AI_BASE_URL || process.env.ASSISTANT_BASE_URL),
      model: process.env.LOCAL_AI_MODEL || process.env.ASSISTANT_MODEL || "local-model",
      baseUrl: localBaseUrl || "http://127.0.0.1:1234/v1",
    },
    ollama: {
      id: "ollama",
      label: "Ollama",
      transport: "ollama-chat",
      configured: Boolean(process.env.OLLAMA_HOST),
      model: process.env.OLLAMA_MODEL || "llama3.1",
      baseUrl: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    },
  };
}

function resolveAssistantConfig(requestedProvider) {
  const normalized = normalizeProviderName(requestedProvider) || defaultAssistantProvider;
  if (normalized === "auto") {
    return resolveAssistantConfig(defaultAssistantProvider);
  }
  const provider = assistantProviderCatalog[normalized];
  if (!provider) {
    return null;
  }
  return provider;
}

function buildAssistantSystemPrompt(bodyContext = null) {
  const assistant = assistantManual.assistant || {};
  const parts = [
    assistant.systemPrompt || assistantSystemFallback,
    assistant.contextSummary || "",
  ].filter(Boolean);

  if (bodyContext && typeof bodyContext === "object") {
    const contextLines = [];
    if (bodyContext.project?.name) contextLines.push(`Project: ${bodyContext.project.name}`);
    if (bodyContext.page) contextLines.push(`Page: ${bodyContext.page}`);
    if (bodyContext.track != null) contextLines.push(`Track: ${bodyContext.track}`);
    if (bodyContext.bank != null) contextLines.push(`Bank: ${bodyContext.bank}`);
    if (bodyContext.pattern != null) contextLines.push(`Pattern: ${bodyContext.pattern}`);
    if (bodyContext.summary) contextLines.push(`Summary: ${bodyContext.summary}`);
    if (contextLines.length > 0) {
      parts.push(`Live context:\n${contextLines.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}

function buildAssistantContextEnvelope() {
  return {
    ...assistantManual,
    providers: assistantProviderCatalog,
    defaultProvider: defaultAssistantProvider,
    endpoints: {
      chat: "/api/assistant/chat",
      context: "/api/assistant/context",
      providers: "/api/assistant/providers",
    },
  };
}

function normalizeAssistantMessages(body) {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages
      .filter((message) => message && typeof message === "object")
      .map((message) => ({
        role: String(message.role || "user"),
        content: normalizeMessageContent(message.content),
      }))
      .filter((message) => message.content);
  }

  if (typeof body.message === "string" && body.message.trim()) {
    return [{ role: "user", content: body.message.trim() }];
  }

  return [];
}

function normalizeMessageContent(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        if (typeof entry.text === "string") return entry.text;
        if (typeof entry.content === "string") return entry.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text.trim();
    if (typeof content.content === "string") return content.content.trim();
  }
  return "";
}

function toOpenAIResponsesInput(systemPrompt, messages) {
  return [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }],
    },
    ...messages.map((message) => ({
      role: message.role,
      content: [{ type: "input_text", text: message.content }],
    })),
  ];
}

function toOpenAIChatMessages(systemPrompt, messages) {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ];
}

function toAnthropicMessages(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }));
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const content = data?.output?.flatMap((item) => item?.content || []) || [];
  const text = content
    .map((entry) => entry?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || "No text response returned.";
}

function extractChatCompletionText(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text === "string" && text.trim()) return text.trim();
  if (Array.isArray(text)) {
    return text.map((entry) => entry?.text || "").filter(Boolean).join("\n").trim();
  }
  return "No text response returned.";
}

function extractAnthropicText(data) {
  const text = data?.content?.map((item) => item?.text || "").filter(Boolean).join("\n").trim();
  return text || "No text response returned.";
}

function extractOllamaText(data) {
  const text = data?.message?.content;
  if (typeof text === "string" && text.trim()) return text.trim();
  return "No text response returned.";
}

function readJsonBody(req, maxBytes = 128 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        req.destroy(error);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (total === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        error.statusCode = 400;
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function withTimeout(timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timer);
    },
  };
}

async function postJson(url, payload, headers = {}, timeoutMs = 60000) {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }
    return { response, data };
  } finally {
    timeout.cancel();
  }
}

function providerResult(provider, model, text, raw = null) {
  return {
    provider,
    model,
    text,
    raw,
  };
}

async function handleAssistantContext(_req, res) {
  sendJson(res, 200, buildAssistantContextEnvelope());
}

async function handleAssistantProviders(_req, res) {
  sendJson(res, 200, {
    defaultProvider: defaultAssistantProvider,
    providers: assistantProviderCatalog,
  });
}

// COOP/COEP headers — required for SharedArrayBuffer and AudioWorklet coordination
const ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...ISOLATION_HEADERS
  });
  res.end(JSON.stringify(data));
}

function writeSse(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastLinkState() {
  const payload = { ...linkState };
  for (const client of [...linkClients]) {
    try {
      writeSse(client, "message", payload);
    } catch (_) {
      linkClients.delete(client);
    }
  }
}

async function handleLinkStream(req, res, url) {
  const clientId = url.searchParams.get("clientId") || `link-${Math.random().toString(36).slice(2, 10)}`;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    ...ISOLATION_HEADERS,
  });
  res.write(": connected\n\n");
  writeSse(res, "message", { ...linkState, clientId, connected: true });
  linkClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (_) {
      clearInterval(heartbeat);
      linkClients.delete(res);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    linkClients.delete(res);
  });
}

async function handleLinkState(req, res) {
  try {
    if (req.method === "GET") {
      sendJson(res, 200, linkState);
      return;
    }

    const body = await readJsonBody(req, 32 * 1024);
    const bpm = Math.max(40, Math.min(240, Number(body.bpm) || linkState.bpm || 122));
    linkState.bpm = bpm;
    linkState.sourceId = typeof body.sourceId === "string" && body.sourceId.trim() ? body.sourceId.trim() : "server";
    linkState.clockSource = typeof body.clockSource === "string" && body.clockSource.trim() ? body.clockSource.trim() : "internal";
    linkState.updatedAt = Date.now();
    broadcastLinkState();
    sendJson(res, 200, { ok: true, ...linkState });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

async function serveFile(res, filePath) {
  if (!existsSync(filePath)) {
    res.writeHead(404, ISOLATION_HEADERS);
    res.end("Not found");
    return;
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    res.writeHead(403, ISOLATION_HEADERS);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
    ...ISOLATION_HEADERS
  });
  createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handleAssistant(req, res) {
  try {
    const body = await readJsonBody(req);
    const providerConfig = resolveAssistantConfig(body.provider);
    const messages = normalizeAssistantMessages(body);
    const systemPrompt = buildAssistantSystemPrompt(body.context);
    const temperatureValue = Number(body.temperature);
    const maxTokensValue = Number(body.maxTokens);
    const temperature = Number.isFinite(temperatureValue) ? temperatureValue : 0.7;
    const maxTokens = Number.isFinite(maxTokensValue) ? maxTokensValue : 300;

    if (!providerConfig) {
      sendJson(res, 400, {
        error: `Unknown provider: ${body.provider}`,
        providers: Object.keys(assistantProviderCatalog),
      });
      return;
    }

    const requestBaseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : providerConfig.baseUrl;

    if (messages.length === 0) {
      sendJson(res, 400, { error: "message or messages is required" });
      return;
    }

    if (providerConfig.id === "openai") {
      if (!process.env.OPENAI_API_KEY) {
        sendJson(res, 400, { error: "OPENAI_API_KEY is not configured" });
        return;
      }

      const { response, data } = await postJson(
        `${requestBaseUrl.replace(/\/$/, "")}/v1/responses`,
        {
          model: body.model || providerConfig.model,
          input: toOpenAIResponsesInput(systemPrompt, messages),
          temperature,
          max_output_tokens: maxTokens,
        },
        {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        }
      );

      if (!response.ok) {
        sendJson(res, response.status, { error: data?.error?.message || data?.raw || JSON.stringify(data) });
        return;
      }

      sendJson(res, 200, providerResult(providerConfig.id, body.model || providerConfig.model, extractOpenAIText(data), data));
      return;
    }

    if (providerConfig.id === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) {
        sendJson(res, 400, { error: "ANTHROPIC_API_KEY is not configured" });
        return;
      }

      const { response, data } = await postJson(
        `${requestBaseUrl.replace(/\/$/, "")}/v1/messages`,
        {
          model: body.model || providerConfig.model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: toAnthropicMessages(messages),
        },
        {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        }
      );

      if (!response.ok) {
        sendJson(res, response.status, { error: data?.error?.message || data?.raw || JSON.stringify(data) });
        return;
      }

      sendJson(res, 200, providerResult(providerConfig.id, body.model || providerConfig.model, extractAnthropicText(data), data));
      return;
    }

    if (providerConfig.id === "local-openai") {
      const { response, data } = await postJson(
        `${requestBaseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          model: body.model || providerConfig.model,
          messages: toOpenAIChatMessages(systemPrompt, messages),
          temperature,
          max_tokens: maxTokens,
        },
        body.apiKey ? { Authorization: `Bearer ${body.apiKey}` } : {}
      );

      if (!response.ok) {
        sendJson(res, response.status, { error: data?.error?.message || data?.raw || JSON.stringify(data) });
        return;
      }

      sendJson(res, 200, providerResult(providerConfig.id, body.model || providerConfig.model, extractChatCompletionText(data), data));
      return;
    }

    if (providerConfig.id === "ollama") {
      const { response, data } = await postJson(
        `${requestBaseUrl.replace(/\/$/, "")}/api/chat`,
        {
          model: body.model || providerConfig.model,
          messages: toOpenAIChatMessages(systemPrompt, messages),
          options: {
            temperature,
            num_predict: maxTokens,
          },
          stream: false,
        }
      );

      if (!response.ok) {
        sendJson(res, response.status, { error: data?.error?.message || data?.raw || JSON.stringify(data) });
        return;
      }

      sendJson(res, 200, providerResult(providerConfig.id, body.model || providerConfig.model, extractOllamaText(data), data));
      return;
    }

    sendJson(res, 501, { error: `Provider transport not implemented: ${providerConfig.id}` });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/assistant/chat") {
    await handleAssistant(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/assistant/context") {
    await handleAssistantContext(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/assistant/providers") {
    await handleAssistantProviders(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/link") {
    handleLinkStream(req, res, url);
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/link/state") {
    await handleLinkState(req, res);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveFile(res, path.join(rootDir, "index.html"));
    return;
  }

  if (url.pathname === "/sw.js") {
    await serveFile(res, path.join(publicDir, "sw.js"));
    return;
  }

  if (url.pathname.startsWith("/src/")) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (url.pathname.startsWith("/docs/")) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (url.pathname.startsWith("/public/")) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/samples") {
    const samplesDir = path.join(rootDir, "samples");
    const audioExts  = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff']);
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

  res.writeHead(404, ISOLATION_HEADERS);
  res.end("Not found");
});

server.listen(port, host, () => {
  console.log(`Confusynth listening on http://${host}:${port}`);
});
