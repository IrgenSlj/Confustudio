// src/share.js — shareable pattern links.
//
// Encodes the current pattern (rhythm AND sound) into a compact, self-contained
// URL fragment (`#s=…`), so a user can share a beat as a link. Opening such a
// link loads the pattern through the command bus — undoable, non-destructive —
// so nothing the recipient had is lost. No backend: the whole beat rides in the
// URL hash, matching the app's "runs entirely in your browser" ethos.
//
// encodePattern / decodeShare / buildApplyCommands are pure and unit-tested
// (tests/share-roundtrip.mjs); only init()/the button/the boot-load touch the DOM.

import { getActivePattern } from './state.js';

// Canonical enum orders — must match the app's. Stable; mirrored here so a shared
// link is a fixed wire format independent of internal refactors.
const MACHINES = ['tone', 'noise', 'sample', 'midi', 'plaits', 'clouds', 'rings'];
const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];
const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf'];

// Track numeric params, in a fixed positional order (the wire format).
const NUM_PARAMS = [
  'pitch',
  'cutoff',
  'resonance',
  'drive',
  'decay',
  'attack',
  'noteLength',
  'volume',
  'pan',
  'delaySend',
  'reverbSend',
];

const SHARE_VERSION = 1;
const MAX_STEPS = 64;

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const r3 = (v) => Math.round(num(v) * 1000) / 1000;
const rInt = (v) => Math.round(num(v));
const clampN = (v, lo, hi, fallback = lo) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};
const idxOf = (list, value, fallback = 0) => {
  const i = list.indexOf(value);
  return i >= 0 ? i : fallback;
};

function toBase64Url(str) {
  const b64 = typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  let b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
}

/** Encode the active pattern of `state` into a compact base64url string. */
export function encodePattern(state) {
  const pattern = getActivePattern(state);
  const tracks = pattern?.kit?.tracks ?? [];
  const length = clampN(pattern?.length ?? 16, 1, MAX_STEPS, 16);

  const t = tracks.slice(0, 8).map((track) => {
    const steps = [];
    const src = Array.isArray(track?.steps) ? track.steps : [];
    for (let i = 0; i < Math.min(src.length, MAX_STEPS); i++) {
      const step = src[i];
      if (step && step.active) {
        steps.push([i, rInt(step.note ?? 60), r3(step.velocity ?? 1), r3(step.probability ?? 1), step.accent ? 1 : 0]);
      }
    }
    return [
      idxOf(MACHINES, track?.machine, 0),
      idxOf(WAVEFORMS, track?.waveform, 1),
      idxOf(FILTER_TYPES, track?.filterType, 0),
      ...NUM_PARAMS.map((p) => (p === 'pitch' || p === 'cutoff' ? rInt(track?.[p]) : r3(track?.[p]))),
      steps,
    ];
  });

  const payload = { v: SHARE_VERSION, b: r3(state?.bpm ?? 122), s: r3(state?.swing ?? 0), l: length, t };
  return toBase64Url(JSON.stringify(payload));
}

/** Decode + strictly validate a share string. Returns a normalized object or null. */
export function decodeShare(str) {
  try {
    const raw = JSON.parse(fromBase64Url(str));
    if (!raw || raw.v !== SHARE_VERSION || !Array.isArray(raw.t)) return null;
    const length = clampN(raw.l, 1, MAX_STEPS, 16);
    const tracks = raw.t.slice(0, 8).map((tr) => {
      const a = Array.isArray(tr) ? tr : [];
      const machineIdx = clampN(a[0], 0, MACHINES.length - 1, 0);
      const waveformIdx = clampN(a[1], 0, WAVEFORMS.length - 1, 1);
      const filterIdx = clampN(a[2], 0, FILTER_TYPES.length - 1, 0);
      const nums = {};
      NUM_PARAMS.forEach((p, i) => {
        nums[p] = num(a[3 + i]);
      });
      const rawSteps = Array.isArray(a[3 + NUM_PARAMS.length]) ? a[3 + NUM_PARAMS.length] : [];
      const steps = rawSteps
        .filter((s) => Array.isArray(s) && Number.isFinite(Number(s[0])))
        .map((s) => ({
          idx: clampN(s[0], 0, MAX_STEPS - 1, 0),
          note: clampN(s[1], 0, 127, 60),
          velocity: clampN(s[2], 0, 1, 1),
          probability: clampN(s[3], 0, 1, 1),
          accent: s[4] ? 1 : 0,
        }));
      return { machineIdx, waveformIdx, filterIdx, nums, steps };
    });
    return { bpm: clampN(raw.b, 40, 240, 122), swing: clampN(raw.s, 0, 1, 0), length, tracks };
  } catch {
    return null;
  }
}

/** Turn a decoded share into a command batch for confustudioCommands.execute(). */
export function buildApplyCommands(data) {
  if (!data) return [];
  const cmds = [
    { type: 'set-transport', bpm: data.bpm, swing: data.swing },
    { type: 'set-pattern-length', length: data.length },
  ];
  data.tracks.forEach((track, ti) => {
    cmds.push({ type: 'set-track-param', trackIndex: ti, param: 'machine', value: MACHINES[track.machineIdx] });
    cmds.push({ type: 'set-track-param', trackIndex: ti, param: 'waveform', value: WAVEFORMS[track.waveformIdx] });
    cmds.push({ type: 'set-track-param', trackIndex: ti, param: 'filterType', value: FILTER_TYPES[track.filterIdx] });
    NUM_PARAMS.forEach((p) => {
      cmds.push({ type: 'set-track-param', trackIndex: ti, param: p, value: track.nums[p] });
    });
    // Every one of the 64 slots must be explicit: replace-track-steps builds a
    // 64-long array and any slot we omit falls back to createStep()'s
    // active-by-default formula, injecting phantom hits past the pattern length.
    const steps = Array.from({ length: MAX_STEPS }, () => ({ active: false }));
    track.steps.forEach((s) => {
      if (s.idx < steps.length) {
        steps[s.idx] = {
          active: true,
          note: s.note,
          velocity: s.velocity,
          probability: s.probability,
          accent: Boolean(s.accent),
        };
      }
    });
    cmds.push({ type: 'replace-track-steps', trackIndex: ti, steps });
  });
  return cmds;
}

// ─── DOM / runtime ──────────────────────────────────────────────────────────

function toast(msg) {
  try {
    (window.__CONFUSTUDIO__?.showToast || window.showToast)?.(msg);
  } catch {
    /* toast is best-effort */
  }
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function onShareClick() {
  const state = window.__CONFUSTUDIO__?.state;
  if (!state) return;
  try {
    const encoded = encodePattern(state);
    const url = `${location.origin}${location.pathname}#s=${encoded}`;
    const copied = await copyToClipboard(url);
    toast(copied ? 'Link copied — anyone can open your pattern' : 'Share link ready in the address bar');
    if (!copied) {
      // Surface it in the URL bar as a fallback the user can copy manually.
      history.replaceState(null, '', url);
    }
  } catch {
    toast('Could not build a share link');
  }
}

function injectShareButton() {
  if (document.getElementById('share-pattern')) return;
  const group = document.querySelector('.studio-controls-group--assist');
  if (!group) return;
  const btn = document.createElement('button');
  btn.id = 'share-pattern';
  btn.type = 'button';
  btn.title = 'Copy a shareable link to this pattern';
  btn.setAttribute('aria-label', 'Copy a shareable link to this pattern');
  btn.textContent = '🔗';
  btn.addEventListener('click', onShareClick);
  // Sit next to the Guide/Assistant buttons.
  group.appendChild(btn);
}

// ─── Shared-arrival overlay ───────────────────────────────────────────────────
// When someone opens a share link, greet them with the beat's payoff (play it)
// and the loop's next step (make it yours, re-share) — not the generic first-run
// tour. This is the surface every launch/demo link lands on.

const ARRIVAL_STYLE_ID = 'cs-share-arrival-style';

function injectArrivalStyles() {
  if (document.getElementById(ARRIVAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ARRIVAL_STYLE_ID;
  style.textContent = `
    .cs-share-backdrop {
      position: fixed; inset: 0; z-index: 9998;
      display: flex; align-items: center; justify-content: center; padding: 24px;
      background: radial-gradient(120% 120% at 50% 0%, rgba(13,21,10,0.72), rgba(5,9,4,0.9));
      backdrop-filter: blur(6px) saturate(1.1); -webkit-backdrop-filter: blur(6px) saturate(1.1);
      opacity: 0; transition: opacity 0.28s ease;
    }
    .cs-share-backdrop.cs-in { opacity: 1; }
    .cs-share-card {
      position: relative; width: min(460px, 100%);
      background: linear-gradient(180deg, #1a2615 0%, #111c0e 100%);
      border: 1px solid rgba(255,255,255,0.14); border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(90,221,113,0.1),
                  inset 0 1px 0 rgba(255,255,255,0.05);
      padding: 30px; color: #e8f4e0; text-align: center;
      transform: translateY(10px) scale(0.985); transition: transform 0.32s cubic-bezier(0.2,0.8,0.2,1);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .cs-share-backdrop.cs-in .cs-share-card { transform: translateY(0) scale(1); }
    .cs-share-eyebrow {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase;
      color: #5add71; margin: 0 0 10px;
    }
    .cs-share-title { margin: 0 0 8px; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; }
    .cs-share-title b { color: #f0c640; }
    .cs-share-sub { margin: 0 0 22px; font-size: 0.9rem; line-height: 1.5; color: rgba(232,244,224,0.72); }
    .cs-share-sub b { color: #e8f4e0; font-weight: 600; }
    .cs-share-actions { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .cs-share-primary {
      appearance: none; cursor: pointer; width: 100%;
      font-family: inherit; font-size: 0.95rem; font-weight: 700;
      padding: 13px 22px; border-radius: 10px;
      color: #16210d; background: #f0c640; border: 1px solid #f0c640;
      box-shadow: 0 6px 20px rgba(240,198,64,0.28);
      transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .cs-share-primary:hover { background: #f4d160; transform: translateY(-1px); box-shadow: 0 8px 26px rgba(240,198,64,0.36); }
    .cs-share-primary:active { transform: translateY(0); }
    .cs-share-ghost {
      appearance: none; cursor: pointer; background: transparent; border: none;
      font-family: inherit; font-size: 0.84rem; color: rgba(232,244,224,0.55);
      padding: 4px; text-decoration: underline; text-underline-offset: 3px; transition: color 0.15s ease;
    }
    .cs-share-ghost:hover { color: rgba(232,244,224,0.9); }
    .cs-share-primary:focus-visible, .cs-share-ghost:focus-visible { outline: 2px solid #5add71; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .cs-share-backdrop, .cs-share-card { transition: none; } }
  `;
  document.head.appendChild(style);
}

function showSharedArrival() {
  injectArrivalStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'cs-share-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'cs-share-title');
  backdrop.innerHTML = `
    <div class="cs-share-card">
      <p class="cs-share-eyebrow">Someone shared a beat</p>
      <h1 class="cs-share-title" id="cs-share-title">Play it. Then <b>make it yours</b>.</h1>
      <p class="cs-share-sub">
        This pattern was made in CONFUstudio and loaded into your studio. Hit play, tweak
        anything, then share your version with the <b>🔗</b> button.
      </p>
      <div class="cs-share-actions">
        <button class="cs-share-primary" type="button" data-cs-play>▶ Play the beat</button>
        <button class="cs-share-ghost" type="button" data-cs-skip>Explore on my own</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  void backdrop.offsetWidth;
  backdrop.classList.add('cs-in');

  const primary = backdrop.querySelector('[data-cs-play]');
  primary?.focus();

  let closed = false;
  const close = (andPlay) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('cs-in');
    const remove = () => backdrop.remove();
    backdrop.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400);
    if (andPlay) {
      try {
        const btn = document.getElementById('btn-play');
        if (btn && !btn.classList.contains('active')) btn.click();
      } catch {
        /* never let a play failure keep the overlay up */
      }
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(false);
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(false);
  });
  primary?.addEventListener('click', () => close(true));
  backdrop.querySelector('[data-cs-skip]')?.addEventListener('click', () => close(false));
}

function whenCommandsReady(cb, tries = 40) {
  if (window.confustudioCommands?.execute && window.__CONFUSTUDIO__?.state) {
    cb();
  } else if (tries > 0) {
    setTimeout(() => whenCommandsReady(cb, tries - 1), 120);
  }
}

function maybeLoadFromHash() {
  const match = /[#&]s=([^&]+)/.exec(location.hash || '');
  if (!match) return;
  const data = decodeShare(decodeURIComponent(match[1]));
  // Clean the hash regardless, so a reload doesn't re-apply and the URL is tidy.
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* ignore */
  }
  if (!data) {
    toast('That share link could not be read');
    return;
  }
  whenCommandsReady(() => {
    try {
      window.confustudioCommands.execute(buildApplyCommands(data), 'Load shared pattern');
      // Give the beat a moment to render behind the overlay.
      setTimeout(showSharedArrival, 250);
    } catch {
      toast('Could not load the shared pattern');
    }
  });
}

function init() {
  const run = () => {
    whenCommandsReady(injectShareButton);
    maybeLoadFromHash();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 300), { once: true });
  } else {
    setTimeout(run, 300);
  }
}

// Only run DOM/boot code in a browser; Node test imports get the pure functions.
if (typeof document !== 'undefined') init();
