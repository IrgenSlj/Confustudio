// One-off verification for the signal-graph fixes: DSP module add (saveState),
// position persistence (meta.x/y), MIDI-learn toast (showToast), and preset
// load → module rebuild. Not part of `npm test`; run directly with node.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

function startServer() {
  const port = 4300 + Math.floor(Math.random() * 1000);
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 10000);
    child.stdout.on('data', (c) => {
      if (c.toString().includes(`listening on http://127.0.0.1:${port}`)) {
        clearTimeout(t);
        resolve();
      }
    });
    child.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return { child, port, ready };
}

const srv = startServer();
await srv.ready;
const BASE = `http://127.0.0.1:${srv.port}/`;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const results = {};
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // Enable modular engine
  await page.click('#btn-modular');
  await page.waitForTimeout(300);

  // Add a DSP module (oscillator = source) via the picker
  await page.click('#add-module');
  await page.waitForSelector('.module-picker button[data-module="dsp-oscillator"]');
  await page.click('.module-picker button[data-module="dsp-oscillator"]');
  await page.waitForTimeout(500);

  results.nodeCreated = await page.evaluate(() => {
    const g = window.__CONFUSTUDIO__?.state?.signalGraph;
    const ids = Object.keys(g?.nodes || {});
    const osc = ids.find((id) => g.nodes[id].plugin === 'oscillator');
    return osc ? { id: osc, meta: g.nodes[osc].meta } : null;
  });

  // Drag the DSP module and confirm snap + meta persistence
  const modId = results.nodeCreated?.id;
  if (modId) {
    const box = await page.locator(`[id="${modId}"]`).boundingBox();
    await page.mouse.move(box.x + 30, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 137, box.y + 99, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    results.afterDrag = await page.evaluate((id) => {
      const n = window.__CONFUSTUDIO__?.state?.signalGraph?.nodes?.[id];
      return { metaX: n?.meta?.x, metaY: n?.meta?.y };
    }, modId);
    results.snappedToGrid =
      results.afterDrag.metaX % 24 === 0 && results.afterDrag.metaY % 24 === 0;
  }

  // Save a preset (stub prompt), then load it and confirm rebuild
  await page.evaluate(() => (window.prompt = () => 'verify-preset'));
  await page.click('#btn-preset-save');
  await page.waitForTimeout(200);
  results.presetSaved = await page.evaluate(
    () => (window.__CONFUSTUDIO__?.state?.signalPresets || []).length,
  );

  const beforeLoad = await page.evaluate(
    () => document.querySelectorAll('.dsp-module').length,
  );
  await page.click('#btn-preset-load');
  await page.waitForSelector('#preset-picker');
  await page.click('#preset-picker div');
  await page.waitForTimeout(800);
  const afterLoad = await page.evaluate(
    () => document.querySelectorAll('.dsp-module').length,
  );
  results.rebuild = { beforeLoad, afterLoad };
  results.positionRestored = await page.evaluate((id) => {
    const el = document.getElementById(id);
    const n = window.__CONFUSTUDIO__?.state?.signalGraph?.nodes?.[id];
    if (!el || !n) return null;
    return {
      domLeft: parseFloat(el.style.left),
      metaX: n.meta?.x,
      matches: parseFloat(el.style.left) === n.meta?.x,
    };
  }, modId);

} catch (e) {
  results.error = e.message;
} finally {
  results.consoleErrors = errors;
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  srv.child.kill();
}
