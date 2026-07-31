import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright';

import { captureCommandState, executeStudioCommand } from '../src/command-bus.js';
import { createAppState, createProjectPackage } from '../src/state.js';

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    samples: sorted.length,
    min: round(sorted[0] || 0),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1) || 0),
    mean: round(sorted.length ? total / sorted.length : 0),
  };
}

function measureSync(iterations, callback) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    callback(index);
    values.push(performance.now() - startedAt);
  }
  return summarize(values);
}

async function reservePort() {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer() {
  const port = await reservePort();
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
      CONFUSTUDIO_ENABLE_ASSISTANT_PROXY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Baseline server start timed out.\n${stdout.join('')}\n${stderr.join('')}`));
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Baseline server exited before ready (${code}).\n${stdout.join('')}\n${stderr.join('')}`));
    });
  });

  return {
    url: `http://127.0.0.1:${port}/`,
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(2_000).then(() => child.kill('SIGKILL'))]);
    },
  };
}

function collectNodeBaseline() {
  const defaultState = createAppState();
  const stateJson = JSON.stringify(defaultState);
  const packageJson = JSON.stringify(createProjectPackage(defaultState));
  const createStateMs = measureSync(12, () => createAppState());
  const captureStateMs = measureSync(8, () => captureCommandState(defaultState));
  const directCommandMs = measureSync(20, (index) => {
    executeStudioCommand(defaultState, { type: 'set-transport', bpm: 120 + (index % 8) });
  });

  return {
    defaultStateBytes: Buffer.byteLength(stateJson),
    defaultProjectPackageBytes: Buffer.byteLength(packageJson),
    eagerShape: {
      banks: defaultState.project?.banks?.length || 0,
      patterns: defaultState.project?.banks?.reduce((sum, bank) => sum + (bank.patterns?.length || 0), 0) || 0,
      tracks:
        defaultState.project?.banks?.reduce(
          (sum, bank) =>
            sum +
            (bank.patterns?.reduce((patternSum, pattern) => patternSum + (pattern.kit?.tracks?.length || 0), 0) || 0),
          0,
        ) || 0,
      steps:
        defaultState.project?.banks?.reduce(
          (sum, bank) =>
            sum +
            (bank.patterns?.reduce(
              (patternSum, pattern) =>
                patternSum +
                (pattern.kit?.tracks?.reduce((trackSum, track) => trackSum + (track.steps?.length || 0), 0) || 0),
              0,
            ) || 0),
          0,
        ) || 0,
    },
    createStateMs,
    captureCommandStateMs: captureStateMs,
    directReducerCommandMs: directCommandMs,
  };
}

async function collectBrowserBaseline() {
  const managedServer = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console:${message.text()}`);
    });

    const coldStartedAt = performance.now();
    await page.goto(managedServer.url, { waitUntil: 'networkidle' });
    const coldLoadWallMs = performance.now() - coldStartedAt;
    await page.waitForFunction(() => window.__CONFUSTUDIO__?.state && window.confustudioCommands?.execute);

    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations || []).map((registration) => registration.unregister()));
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    });

    const reloadStartedAt = performance.now();
    await page.reload({ waitUntil: 'networkidle' });
    const cleanReloadWallMs = performance.now() - reloadStartedAt;
    await page.waitForFunction(() => window.__CONFUSTUDIO__?.state && window.confustudioCommands?.execute);

    const pageMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const controls = [
        ...document.querySelectorAll(
          'button,input,select,textarea,a[href],[role="button"],[role="slider"],[role="switch"],[tabindex]',
        ),
      ].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });

      function nameFor(element) {
        const id = element.getAttribute('id');
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        return (
          element.getAttribute('aria-label') ||
          element.getAttribute('title') ||
          element.getAttribute('alt') ||
          element.getAttribute('placeholder') ||
          element.getAttribute('value') ||
          label?.textContent ||
          element.closest('label')?.textContent ||
          element.textContent ||
          ''
        ).trim();
      }

      const dimensions = controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, name: nameFor(element) };
      });
      const localStorageBytes = Object.keys(localStorage).reduce((total, key) => {
        return total + key.length + (localStorage.getItem(key)?.length || 0);
      }, 0);

      return {
        domNodes: document.querySelectorAll('*').length,
        visibleInteractiveControls: controls.length,
        unnamedInteractiveControls: dimensions.filter((control) => !control.name).length,
        controlsBelow24px: dimensions.filter((control) => control.width < 24 || control.height < 24).length,
        controlsBelow32px: dimensions.filter((control) => control.width < 32 || control.height < 32).length,
        localStorageBytes,
        navigation: navigation
          ? {
              domContentLoadedMs: navigation.domContentLoadedEventEnd,
              loadEventMs: navigation.loadEventEnd,
              transferBytes: navigation.transferSize,
            }
          : null,
      };
    });

    const browserCommandMs = await page.evaluate(() => {
      const samples = [];
      for (let index = 0; index < 6; index += 1) {
        const startedAt = performance.now();
        window.confustudioCommands.execute({ type: 'set-transport', bpm: 123 + index }, '');
        samples.push(performance.now() - startedAt);
      }
      return samples;
    });

    await page.locator('#btn-play').click();
    await page.waitForFunction(() => window.__CONFUSTUDIO__?.state?.engine?.context);
    await page.locator('#btn-stop').click();

    await page.evaluate(() => {
      const state = window.__CONFUSTUDIO__.state;
      state.bpm = 120;
      state.swing = 0;
      state.humanizeAmount = 0;
      state.activeBank = 0;
      state.activePattern = 0;
      const tracks = state.project.banks[0].patterns[0].kit.tracks;
      tracks.forEach((track, trackIndex) => {
        track.mute = trackIndex !== 0;
        track.solo = false;
        track.swing = 0;
        track.steps.forEach((step, stepIndex) => {
          step.active = trackIndex === 0 && stepIndex < 16;
          step.probability = 1;
          step.microTime = 0;
          step.mute = false;
          step.trigCondition = 'always';
        });
      });
      window.__baselineTriggers = [];
      state.engine.triggerTrack = (_track, when, stepDuration, options = {}) => {
        window.__baselineTriggers.push({
          scheduledTime: when,
          observedAudioTime: state.engine.context.currentTime,
          stepDuration,
          trackIndex: options.trackIndex,
        });
      };
    });

    await page.locator('#btn-play').click();
    await page.waitForTimeout(1_800);
    await page.locator('#btn-stop').click();
    const triggers = await page.evaluate(() => window.__baselineTriggers || []);
    const trackTriggers = triggers
      .filter((trigger) => trigger.trackIndex === 0)
      .sort((a, b) => a.scheduledTime - b.scheduledTime);
    const intervalJitterMs = [];
    for (let index = 1; index < trackTriggers.length; index += 1) {
      intervalJitterMs.push(
        Math.abs((trackTriggers[index].scheduledTime - trackTriggers[index - 1].scheduledTime) * 1000 - 125),
      );
    }
    const submissionLeadMs = trackTriggers.map((trigger) => (trigger.scheduledTime - trigger.observedAudioTime) * 1000);

    return {
      browser: await browser.version(),
      viewport: { width: 1365, height: 768 },
      coldLoadWallMs: round(coldLoadWallMs),
      cleanReloadWallMs: round(cleanReloadWallMs),
      ...pageMetrics,
      publicCommandMs: summarize(browserCommandMs),
      scheduler: {
        bpm: 120,
        expectedStepIntervalMs: 125,
        capturedTriggers: trackTriggers.length,
        scheduledIntervalJitterMs: summarize(intervalJitterMs),
        submissionLeadMs: summarize(submissionLeadMs),
      },
      consoleErrors: errors,
    };
  } finally {
    await browser?.close();
    await managedServer.stop();
  }
}

const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg ? path.resolve(outputArg.slice('--output='.length)) : null;
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: {
    node: process.version,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpu: os.cpus()[0]?.model || 'unknown',
    logicalCpuCount: os.cpus().length,
  },
  node: collectNodeBaseline(),
  browser: await collectBrowserBaseline(),
  interpretation: {
    thresholds: 'Characterization only. Target budgets are defined in docs/DEVELOPMENT_PLAN.md.',
    accessibility: 'Counts are heuristic inventory, not an axe or manual accessibility audit.',
    scheduler: 'Measures submission lead and scheduled timestamp regularity, not acoustic output jitter.',
  },
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');
  console.log(`Wrote baseline report to ${path.relative(process.cwd(), outputPath)}`);
} else {
  process.stdout.write(json);
}
