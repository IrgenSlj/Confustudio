import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright';

import { pickTestPort } from './helpers/port.mjs';

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) error.details = details;
    throw error;
  }
}

async function startServer() {
  const port = pickTestPort(5300);
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
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

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Server start timed out.\n${stdout.join('')}\n${stderr.join('')}`)),
      10_000,
    );
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
    baseUrl: `http://127.0.0.1:${port}/`,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(2_000).then(() => child.kill('SIGKILL'))]);
    },
  };
}

const hostile = JSON.parse(await readFile(new URL('./fixtures/projects/hostile-import.json', import.meta.url), 'utf8'));
const payload = hostile.project.name;
const storedState = {
  project: hostile.project,
  currentPage: 'pattern',
  bpm: 122,
  arranger: [
    {
      sceneIdx: 0,
      bars: 4,
      repeat: 1,
      muted: false,
      name: payload,
      followAction: 'next',
      trackMutes: [false, false, false, false, false, false, false, false],
    },
  ],
  recorderSlotsMeta: [{ name: payload, source: 'master', durationSec: 1, createdAt: 1 }],
  convReverbPreset: payload,
};

const server = await startServer();
let browser;
const pageErrors = [];

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript((state) => {
    globalThis.__fixtureExecuted = false;
    globalThis.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      globalThis.__cspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
    localStorage.setItem('confustudio-dev-shell-version', 'confustudio-shell-v7');
    localStorage.setItem('confustudio-v3', JSON.stringify(state));
  }, storedState);

  const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert(response?.ok(), 'Hostile-state page failed to load', { status: response?.status() });
  await page.waitForSelector('#page-content .page-title');

  const initial = await page.evaluate(
    (expectedPayload) => ({
      executed: globalThis.__fixtureExecuted,
      literalTextPresent: document.querySelector('#page-content')?.textContent.includes(expectedPayload),
      executableNodes: document.querySelectorAll(
        '#page-content script, #page-content [onerror], #page-content [onload]',
      ).length,
    }),
    payload,
  );
  assert(initial.literalTextPresent, 'Hostile project name was not preserved as literal text', initial);
  assert(!initial.executed && initial.executableNodes === 0, 'Hostile project data became executable markup', initial);

  for (const pageName of ['banks', 'sound', 'fx', 'piano-roll', 'arranger', 'settings', 'pattern']) {
    await page.click(`button[data-page="${pageName}"]`);
    await page.waitForTimeout(120);
    const boundaryState = await page.evaluate(() => ({
      executed: globalThis.__fixtureExecuted,
      executableNodes: document.querySelectorAll(
        '#page-content script, #page-content [onerror], #page-content [onload], #page-content img[src="x"]',
      ).length,
    }));
    assert(!boundaryState.executed, `Hostile data executed on ${pageName}`, boundaryState);
    assert(boundaryState.executableNodes === 0, `Executable hostile DOM appeared on ${pageName}`, boundaryState);
  }

  const finalState = await page.evaluate(() => ({
    executed: globalThis.__fixtureExecuted,
    cspViolations: globalThis.__cspViolations,
  }));
  assert(!finalState.executed, 'Hostile fixture executed in the browser', finalState);
  assert(finalState.cspViolations.length === 0, 'Application resources violated the configured CSP', finalState);
  assert(pageErrors.length === 0, 'Browser reported page errors during hostile-state navigation', pageErrors);

  console.log(JSON.stringify({ ok: true, pagesChecked: 7, cspViolations: 0 }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || null }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.stop();
}
