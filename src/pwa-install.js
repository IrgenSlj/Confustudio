// src/pwa-install.js — tasteful "Install app" nudge.
//
// "Installable PWA" is a headline claim, but the actual install action is buried
// in the browser's own menu, so almost nobody finds it. This captures the
// `beforeinstallprompt` event Chromium fires for eligible visitors and offers a
// subtle, dismissible chip — installed users retain far better than tab visitors.
// Self-contained: one <script> tag, injects its own styles, never blocks the app.

const DISMISS_KEY = 'confustudio-pwa-dismissed-v1';
const STYLE_ID = 'cs-pwa-style';

let deferredPrompt = null;

function dismissedForever() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* private mode — fine */
  }
}

function alreadyInstalled() {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true // iOS Safari
    );
  } catch {
    return false;
  }
}

function toast(msg) {
  try {
    (window.__CONFUSTUDIO__?.showToast || window.showToast)?.(msg);
  } catch {
    /* best-effort */
  }
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cs-pwa-chip {
      position: fixed; left: 18px; bottom: 18px; z-index: 9990;
      display: inline-flex; align-items: center; gap: 10px;
      padding: 9px 12px 9px 14px; border-radius: 999px;
      background: linear-gradient(180deg, #1a2615 0%, #111c0e 100%);
      border: 1px solid rgba(240,198,64,0.35);
      box-shadow: 0 8px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(240,198,64,0.08);
      color: #e8f4e0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 0.82rem; transform: translateY(16px); opacity: 0;
      transition: transform 0.3s cubic-bezier(0.2,0.8,0.2,1), opacity 0.3s ease;
    }
    .cs-pwa-chip.cs-in { transform: translateY(0); opacity: 1; }
    .cs-pwa-install {
      appearance: none; cursor: pointer; border: none; background: transparent;
      color: #f0c640; font: inherit; font-weight: 700; letter-spacing: 0.01em; padding: 0;
      display: inline-flex; align-items: center; gap: 7px;
    }
    .cs-pwa-install:hover { color: #f4d160; }
    .cs-pwa-dismiss {
      appearance: none; cursor: pointer; border: none; background: transparent;
      color: rgba(232,244,224,0.4); font-size: 0.95rem; line-height: 1; padding: 2px 4px;
      border-radius: 6px; transition: color 0.15s ease, background 0.15s ease;
    }
    .cs-pwa-dismiss:hover { color: #e8f4e0; background: rgba(255,255,255,0.06); }
    .cs-pwa-install:focus-visible, .cs-pwa-dismiss:focus-visible { outline: 2px solid #5add71; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .cs-pwa-chip { transition: none; } }
  `;
  document.head.appendChild(style);
}

function hideChip() {
  const chip = document.getElementById('cs-pwa-chip');
  if (!chip) return;
  chip.classList.remove('cs-in');
  chip.addEventListener('transitionend', () => chip.remove(), { once: true });
  setTimeout(() => chip.remove(), 400);
}

async function doInstall() {
  const prompt = deferredPrompt;
  if (!prompt) {
    hideChip();
    return;
  }
  deferredPrompt = null; // a prompt can only be used once
  try {
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === 'accepted') {
      toast('Installing CONFUstudio…');
    }
  } catch {
    /* user closed it or the platform refused — nothing to do */
  }
  hideChip();
}

function showChip() {
  if (document.getElementById('cs-pwa-chip')) return;
  injectStyles();
  const chip = document.createElement('div');
  chip.id = 'cs-pwa-chip';
  chip.className = 'cs-pwa-chip';
  chip.setAttribute('role', 'dialog');
  chip.setAttribute('aria-label', 'Install CONFUstudio as an app');
  chip.innerHTML = `
    <button class="cs-pwa-install" type="button">
      <span aria-hidden="true">⤓</span> Install CONFUstudio
    </button>
    <button class="cs-pwa-dismiss" type="button" aria-label="Not now">✕</button>
  `;
  document.body.appendChild(chip);
  void chip.offsetWidth;
  chip.classList.add('cs-in');
  chip.querySelector('.cs-pwa-install')?.addEventListener('click', doInstall);
  chip.querySelector('.cs-pwa-dismiss')?.addEventListener('click', () => {
    rememberDismissed();
    hideChip();
  });
}

function init() {
  if (alreadyInstalled()) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chromium's default mini-infobar; we present our own chip instead.
    e.preventDefault();
    deferredPrompt = e;
    if (dismissedForever()) return;
    // Let the studio settle before nudging.
    setTimeout(showChip, 1200);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideChip();
    toast('Installed — find CONFUstudio in your apps');
  });
}

if (typeof window !== 'undefined') init();
