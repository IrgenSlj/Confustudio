// One-off verification for the design-system token additions + light theme.
// Confirms new tokens resolve, the light theme applies and overrides surfaces,
// text contrast holds, and switching themes throws nothing. Run with node.
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

// Relative luminance + contrast ratio per WCAG.
function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function parseRGB(s) {
  const m = s.match(/(\d+\.?\d*)/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}
function contrast(a, b) {
  const la = luminance(parseRGB(a)) + 0.05;
  const lb = luminance(parseRGB(b)) + 0.05;
  return +(Math.max(la, lb) / Math.min(la, lb)).toFixed(2);
}

const srv = startServer();
await srv.ready;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const results = {};
try {
  await page.goto(`http://127.0.0.1:${srv.port}/`, { waitUntil: 'networkidle' });

  const readTokens = () =>
    page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      // Resolve a token against an element so color-mix/var chains compute.
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      probe.style.color = 'var(--text)';
      probe.style.background = 'var(--surface)';
      const pcs = getComputedStyle(probe);
      const out = {
        space6: v('--space-6'),
        radiusMd: v('--radius-md'),
        touchMin: v('--touch-min'),
        zToast: v('--z-toast'),
        success: v('--success'),
        textResolved: pcs.color,
        surfaceResolved: pcs.backgroundColor,
      };
      probe.remove();
      return out;
    });

  results.darkTokens = await readTokens();

  // Switch to light theme as the app does on boot/selection.
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.waitForTimeout(100);
  results.lightTokens = await readTokens();
  results.lightContrast = contrast(
    results.lightTokens.textResolved,
    results.lightTokens.surfaceResolved,
  );
  results.darkContrast = contrast(
    results.darkTokens.textResolved,
    results.darkTokens.surfaceResolved,
  );
  results.lightDiffersFromDark =
    results.lightTokens.surfaceResolved !== results.darkTokens.surfaceResolved;

  results.consoleErrors = errors;
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  results.error = e.message;
  results.consoleErrors = errors;
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  srv.child.kill();
}
