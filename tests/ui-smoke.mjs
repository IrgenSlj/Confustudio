import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

let BASE_URL = process.env.CONFUSYNTH_BASE_URL || '';

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) error.details = details;
    throw error;
  }
}

async function clearBrowserState(page) {
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    if (regs) await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function startServer() {
  const port = 4300 + Math.floor(Math.random() * 1000);
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
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

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for server start.\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`CONFUstudio listening on http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ready with code ${code}.\nSTDOUT:\n${stdout.join('')}\nSTDERR:\n${stderr.join('')}`));
    });
  });

  await ready;

  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([
        once(child, 'exit'),
        delay(2000).then(() => child.kill('SIGKILL')),
      ]);
    },
  };
}

const managedServer = BASE_URL ? null : await startServer();
BASE_URL = BASE_URL || managedServer.baseUrl;
let browser = null;
let page = null;
const consoleErrors = [];

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror:${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console:${m.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await clearBrowserState(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  async function canvasTransform() {
    return page.evaluate(() => getComputedStyle(document.querySelector('#studio-canvas')).transform);
  }

  const initial = await page.evaluate(() => ({
    moduleCount: document.querySelectorAll('.studio-module').length,
    keyboardDisplay: getComputedStyle(document.querySelector('.kbd-panel')).display,
    zoomLabel: document.querySelector('#zoom-level')?.textContent,
    hasAddModule: !!document.querySelector('#add-module'),
    hasFit: !!document.querySelector('#fit-all'),
    hasGuide: !!document.querySelector('#open-manual'),
    hasAssistant: !!document.querySelector('#open-assistant'),
    lensOffByDefault: document.querySelector('#toggle-zoom-lens')?.classList.contains('lens-off'),
    pageContentRect: (() => {
      const r = document.querySelector('#page-content')?.getBoundingClientRect();
      return r ? { width: r.width, height: r.height } : null;
    })(),
  }));

  assert(initial.moduleCount === 1, 'Expected a single module on clean startup', initial);
  assert(initial.keyboardDisplay !== 'none', 'Keyboard panel should be visible on desktop startup', initial);
  assert(initial.hasAddModule && initial.hasFit, 'Studio controls are missing', initial);
  assert(initial.hasGuide && initial.hasAssistant, 'Guide/Assistant entry points are missing', initial);
  assert(initial.lensOffByDefault, 'Zoom lens should be opt-in on clean startup', initial);
  assert(initial.pageContentRect && initial.pageContentRect.width > 400 && initial.pageContentRect.height > 300, 'Page content area is too small to be usable', initial);

  const wrapBox = await page.locator('#studio-wrap').boundingBox();
  assert(wrapBox, 'Studio viewport is missing');
  const transformBeforeBgPan = await canvasTransform();
  await page.mouse.move(wrapBox.x + wrapBox.width - 80, wrapBox.y + 120);
  await page.mouse.wheel(-140, 95);
  await page.waitForTimeout(150);
  const transformAfterBgPan = await canvasTransform();
  assert(transformAfterBgPan !== transformBeforeBgPan, 'Two-finger style pan on empty studio space did not move the viewport', {
    transformBeforeBgPan,
    transformAfterBgPan,
  });

  const bezelBox = await page.locator('.screen-bezel').boundingBox();
  assert(bezelBox, 'Primary synth screen is missing');
  const transformBeforeModulePan = await canvasTransform();
  await page.mouse.move(bezelBox.x + (bezelBox.width * 0.5), bezelBox.y + 24);
  await page.mouse.wheel(90, 70);
  await page.waitForTimeout(150);
  const transformAfterModulePan = await canvasTransform();
  assert(transformAfterModulePan !== transformBeforeModulePan, 'Two-finger style pan on the synth surface did not move the viewport', {
    transformBeforeModulePan,
    transformAfterModulePan,
  });

  await page.click('#zoom-in');
  await page.waitForTimeout(150);
  const zoomAfter = await page.textContent('#zoom-level');
  assert(zoomAfter && zoomAfter !== initial.zoomLabel, 'Zoom-in did not change the viewport zoom label', { before: initial.zoomLabel, after: zoomAfter });

  await page.click('#add-module');
  await page.waitForTimeout(100);
  const pickerOpen = await page.locator('#module-picker').count();
  assert(pickerOpen === 1, 'Add Module did not open the module picker');
  const pickerBox = await page.locator('#module-picker').boundingBox();
  assert(pickerBox && pickerBox.width <= 420, 'Module picker should stay compact on desktop', pickerBox);

  await page.click('.module-picker button[data-module="figure-robot"]');
  await page.waitForTimeout(250);
  const moduleCountAfterAdd = await page.locator('.studio-module').count();
  assert(moduleCountAfterAdd === 2, 'Module insertion failed', { moduleCountAfterAdd });

  const removeEnabled = await page.evaluate(() => !document.querySelector('#remove-module')?.disabled);
  assert(removeEnabled, 'Inserted module did not become selected for removal', { removeEnabled });

  await page.click('#open-manual');
  await page.waitForTimeout(200);
  const guideVisible = await page.locator('#studio-overlay:not(.hidden)').count();
  assert(guideVisible === 1, 'Guide overlay did not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  await page.click('#open-assistant');
  await page.waitForTimeout(200);
  const assistantVisible = await page.locator('#studio-overlay:not(.hidden)').count();
  assert(assistantVisible === 1, 'Assistant overlay did not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  await page.click('#add-module');
  await page.waitForTimeout(100);
  await page.click('.module-picker button[data-module="djmixer"]');
  await page.waitForTimeout(400);
  const moduleCountAfterMixerAdd = await page.locator('.studio-module').count();
  assert(moduleCountAfterMixerAdd === 3, 'DJ mixer insertion failed', { moduleCountAfterMixerAdd });

  const mixerModuleId = await page.evaluate(() => document.querySelector('.studio-module[data-module-type="djmixer"]')?.id || '');
  assert(Boolean(mixerModuleId), 'DJ mixer module id is missing');
  await page.click('#add-module');
  await page.waitForTimeout(100);
  const moduleNavigatorCount = await page.locator('#module-picker .mp-module-btn').count();
  assert(moduleNavigatorCount === moduleCountAfterMixerAdd, 'Module picker navigator does not list all modules', {
    moduleNavigatorCount,
    moduleCountAfterMixerAdd,
  });
  await page.locator(`#module-picker .mp-module-btn[data-focus-module="${mixerModuleId}"]`).click();
  await page.waitForTimeout(150);
  const mixerSelectedFromNavigator = await page.evaluate((id) => document.getElementById(id)?.classList.contains('module-selected'), mixerModuleId);
  assert(mixerSelectedFromNavigator, 'Module picker navigator did not select the requested module', { mixerModuleId });

  const mixerKnobBefore = await page.evaluate(() => {
    const mod = document.querySelector('.studio-module[data-module-type="djmixer"]');
    const knob = mod?.querySelector('.djm-knob');
    return {
      left: mod?.style.left,
      top: mod?.style.top,
      transform: knob ? getComputedStyle(knob).transform : null,
    };
  });
  const mixerKnobBox = await page.locator('.studio-module[data-module-type="djmixer"] .djm-knob').first().boundingBox();
  assert(mixerKnobBox, 'DJ mixer knob is missing');
  await page.mouse.move(mixerKnobBox.x + mixerKnobBox.width / 2, mixerKnobBox.y + mixerKnobBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(mixerKnobBox.x + mixerKnobBox.width / 2, mixerKnobBox.y + mixerKnobBox.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const mixerKnobAfter = await page.evaluate(() => {
    const mod = document.querySelector('.studio-module[data-module-type="djmixer"]');
    const knob = mod?.querySelector('.djm-knob');
    return {
      left: mod?.style.left,
      top: mod?.style.top,
      transform: knob ? getComputedStyle(knob).transform : null,
    };
  });
  assert(mixerKnobBefore.transform !== mixerKnobAfter.transform, 'DJ mixer knob drag did not rotate the knob', { mixerKnobBefore, mixerKnobAfter });
  assert(mixerKnobBefore.left === mixerKnobAfter.left && mixerKnobBefore.top === mixerKnobAfter.top, 'Knob drag moved the whole module', { mixerKnobBefore, mixerKnobAfter });

  const mixerFaderBefore = await page.evaluate(() => document.querySelector('.studio-module[data-module-type="djmixer"] .djm-fader')?.value);
  const mixerFaderBox = await page.locator('.studio-module[data-module-type="djmixer"] .djm-fader').first().boundingBox();
  assert(mixerFaderBox, 'DJ mixer fader is missing');
  await page.mouse.move(mixerFaderBox.x + mixerFaderBox.width / 2, mixerFaderBox.y + mixerFaderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(mixerFaderBox.x + mixerFaderBox.width / 2, mixerFaderBox.y + mixerFaderBox.height - 4, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const mixerFaderAfter = await page.evaluate(() => document.querySelector('.studio-module[data-module-type="djmixer"] .djm-fader')?.value);
  assert(mixerFaderBefore !== mixerFaderAfter, 'DJ mixer fader drag did not change the slider value', { mixerFaderBefore, mixerFaderAfter });

  await page.click('#fit-all');
  await page.waitForTimeout(150);
  const transformBeforeFitButton = await canvasTransform();
  await page.locator('.studio-module[data-module-type="djmixer"] .module-fit-btn').click();
  await page.waitForTimeout(150);
  const transformAfterFitButton = await canvasTransform();
  assert(transformAfterFitButton !== transformBeforeFitButton, 'Module fit button did not focus the selected module', {
    transformBeforeFitButton,
    transformAfterFitButton,
  });

  await page.click('#fit-all');
  await page.waitForTimeout(150);
  const transformBeforeModuleFit = await canvasTransform();
  await page.locator('.studio-module[data-module-type="djmixer"] .djm-body').dblclick();
  await page.waitForTimeout(150);
  const transformAfterModuleFit = await canvasTransform();
  assert(transformAfterModuleFit !== transformBeforeModuleFit, 'Double-clicking a module did not fit it to the viewport', {
    transformBeforeModuleFit,
    transformAfterModuleFit,
  });

  const cableCreated = await page.evaluate(() => {
    const modules = [...document.querySelectorAll('.studio-module')];
    const primary = modules.find((mod) => mod.id === 'module-0');
    const mixer = modules.find((mod) => mod.dataset.moduleType === 'djmixer');
    const fromEl = primary?.querySelector('.port');
    const toEl = mixer?.querySelector('.djm-port, .port');
    if (!fromEl || !toEl) return false;
    document.dispatchEvent(new CustomEvent('cable:autoconnect', { detail: { fromEl, toEl } }));
    return true;
  });
  assert(cableCreated, 'Could not find ports to create a cable for removal testing');
  await page.waitForTimeout(150);
  const cableCountBeforeRemoval = await page.locator('#studio-cables .cable-group').count();
  assert(cableCountBeforeRemoval >= 1, 'Expected at least one cable before module removal', { cableCountBeforeRemoval });

  await page.locator('.studio-module[data-module-type="djmixer"] .module-remove-btn').click();
  await page.waitForTimeout(250);
  const cableCountAfterRemoval = await page.locator('#studio-cables .cable-group').count();
  assert(cableCountAfterRemoval === 0, 'Cable cleanup failed after module removal', { cableCountAfterRemoval });

  const tabs = ['PATTERN', 'ROLL', 'PADS', 'SOUND', 'SCENES', 'MIXER', 'SET'];
  for (const tab of tabs) {
    await page.locator('.page-tabs .tab', { hasText: tab }).first().click();
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      htmlLen: document.querySelector('#page-content')?.innerHTML?.length || 0,
      scrollHeight: document.querySelector('#page-content')?.scrollHeight || 0,
      clientHeight: document.querySelector('#page-content')?.clientHeight || 0,
      scrollTop: document.querySelector('#page-content')?.scrollTop || 0,
    }));
    assert(state.htmlLen > 1000, `${tab} page rendered too little DOM`, state);
    assert(state.scrollHeight >= state.clientHeight, `${tab} page has invalid scroll metrics`, state);
    assert(state.scrollTop === 0, `${tab} page did not reset scroll position on tab switch`, state);
  }

  assert(consoleErrors.length === 0, 'Browser reported runtime errors', { consoleErrors });
  console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL }, null, 2));
} catch (error) {
  const payload = {
    ok: false,
    message: error.message,
    details: error.details || null,
    consoleErrors,
    baseUrl: BASE_URL,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await managedServer?.stop();
}
