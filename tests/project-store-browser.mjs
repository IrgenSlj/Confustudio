// The Node suite exercises the store logic against an in-memory backend. That
// proves the logic but NOT createIndexedDbBackend, which is the code that
// actually runs in production — a broken IDB wrapper would leave every other
// test green while nothing persisted.
//
// This drives the real backend in Chromium, including a reopen through a fresh
// connection so "it persisted" cannot be an in-memory illusion.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
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
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timed out')), 10_000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ready (${code})`));
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

const server = await startServer();
let browser;
const pageErrors = [];

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('confustudio-dev-shell-version', 'confustudio-shell-v7'));
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#page-content .page-title', { timeout: 15_000 });

  const result = await page.evaluate(async () => {
    const { createIndexedDbBackend, createProjectStore } = await import('/src/project/store.js');
    const { createProjectV4 } = await import('/src/project/v4/index.js');

    const project = createProjectV4({ id: 'prj_idb', meta: { name: 'IDB Test' } });
    project.revision = 0;
    project.tracks.byId.trk_0 = {
      id: 'trk_0',
      name: 'T1',
      stepCount: 16,
      params: { volume: 0.7 },
      steps: { 1: { active: true } },
    };
    project.patterns.byId.pat_0 = { id: 'pat_0', name: 'P1', length: 16, tracks: ['trk_0'] };
    project.banks.byId.bnk_0 = { id: 'bnk_0', name: 'A', patterns: ['pat_0'] };
    project.banks.order.push('bnk_0');

    const legacyBlob = JSON.stringify({
      project: {
        name: 'Legacy',
        banks: [{ name: 'A', patterns: [{ name: 'P', kit: { tracks: [{ name: 'K', volume: 0.5 }] } }] }],
      },
    });
    const legacy = { getItem: (key) => (key === 'confustudio-v3' ? legacyBlob : null), setItem() {}, removeItem() {} };
    const store = createProjectStore({ backend: createIndexedDbBackend(), legacyStorage: legacy });

    const fresh = await store.load();
    const saved = await store.save(project);
    const loaded = await store.load();
    const migration = await store.migrateFromLegacy();
    const backup = await store.readBackup();

    const reopened = createProjectStore({ backend: createIndexedDbBackend() });
    const reloaded = await reopened.load();

    return {
      freshOutcome: fresh.outcome,
      savedOutcome: saved.outcome,
      loadedOutcome: loaded.outcome,
      roundTripExact: JSON.stringify(loaded.project) === JSON.stringify(project),
      migrationOutcome: migration.outcome,
      backupPersisted: Boolean(backup),
      reloadedOutcome: reloaded.outcome,
      persistedAcrossConnections: Boolean(reloaded.project),
    };
  });

  assert(result.freshOutcome === 'fresh', 'An empty IndexedDB store must report fresh', result);
  assert(result.savedOutcome === 'saved', 'Saving to real IndexedDB must succeed', result);
  assert(result.loadedOutcome === 'loaded', 'Reading back from real IndexedDB must succeed', result);
  assert(result.roundTripExact, 'A project must round-trip through IndexedDB byte for byte', result);
  assert(result.migrationOutcome.startsWith('migrated'), 'Legacy migration must work against real IndexedDB', result);
  assert(result.backupPersisted, 'The pre-migration backup must be persisted in IndexedDB', result);
  assert(result.persistedAcrossConnections, 'Data must survive a brand-new IndexedDB connection', result);
  assert(pageErrors.length === 0, 'Browser reported page errors', pageErrors);

  console.log(JSON.stringify({ ok: true, backend: 'indexeddb', ...result }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.stop();
}
