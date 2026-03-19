import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const srcDir = path.join(rootDir, "src");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

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
  const body = await readBody(req);
  const provider = body.provider || "openai";
  const message = body.message;

  if (!message) {
    sendJson(res, 400, { error: "message is required" });
    return;
  }

  try {
    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
      if (!apiKey) {
        sendJson(res, 400, { error: "OPENAI_API_KEY is not configured" });
        return;
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "You are a concise music production assistant for a hybrid sampler-sequencer prototype. Focus on sound design, sequencing suggestions, and workflow ideas."
                }
              ]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: message }]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        sendJson(res, response.status, { error: errorText });
        return;
      }

      const data = await response.json();
      sendJson(res, 200, {
        provider,
        text: data.output_text || "No text response returned."
      });
      return;
    }

    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
      if (!apiKey) {
        sendJson(res, 400, { error: "ANTHROPIC_API_KEY is not configured" });
        return;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system: "You are a concise music production assistant for a hybrid sampler-sequencer prototype. Focus on sound design, sequencing suggestions, and workflow ideas.",
          messages: [{ role: "user", content: message }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        sendJson(res, response.status, { error: errorText });
        return;
      }

      const data = await response.json();
      sendJson(res, 200, {
        provider,
        text: data.content?.map((item) => item.text).join("\n") || "No text response returned."
      });
      return;
    }

    if (provider === "mcp") {
      sendJson(res, 501, {
        error: "MCP transport is not implemented in this prototype. Use the README contract to attach a local MCP bridge."
      });
      return;
    }

    sendJson(res, 400, { error: `Unknown provider: ${provider}` });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/assistant/chat") {
    await handleAssistant(req, res);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveFile(res, path.join(rootDir, "index.html"));
    return;
  }

  if (url.pathname.startsWith("/src/")) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  if (url.pathname.startsWith("/public/")) {
    await serveFile(res, path.join(rootDir, url.pathname));
    return;
  }

  res.writeHead(404, ISOLATION_HEADERS);
  res.end("Not found");
});

server.listen(port, host, () => {
  console.log(`Confusynth listening on http://${host}:${port}`);
});
