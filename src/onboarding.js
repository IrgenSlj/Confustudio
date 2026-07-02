// src/onboarding.js — first-run welcome overlay.
//
// Fully self-contained: injects its own scoped styles, checks a localStorage
// flag, and only ever shows once for a brand-new visitor. It never blocks the
// app — dismiss with the button, "explore" link, Esc, or a backdrop click.
//
// The primary button is a real user gesture, so it can both dismiss the overlay
// AND start playback — a first-time visitor hears the demo immediately, which
// is the whole point of the studio.

const ONBOARD_KEY = 'confustudio-onboarded-v1';
const STYLE_ID = 'cs-onboard-style';

function alreadyOnboarded() {
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARD_KEY, '1');
  } catch {
    /* private mode — showing once per session is fine */
  }
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cs-onboard-backdrop {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      background: radial-gradient(120% 120% at 50% 0%, rgba(13,21,10,0.72), rgba(5,9,4,0.9));
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      opacity: 0; transition: opacity 0.28s ease;
    }
    .cs-onboard-backdrop.cs-in { opacity: 1; }
    .cs-onboard-card {
      position: relative;
      width: min(520px, 100%);
      background: linear-gradient(180deg, #1a2615 0%, #111c0e 100%);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,198,64,0.08),
                  inset 0 1px 0 rgba(255,255,255,0.05);
      padding: 30px 30px 26px;
      color: #e8f4e0;
      transform: translateY(10px) scale(0.985);
      transition: transform 0.32s cubic-bezier(0.2,0.8,0.2,1);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .cs-onboard-backdrop.cs-in .cs-onboard-card { transform: translateY(0) scale(1); }
    .cs-onboard-eyebrow {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase;
      color: #f0c640; margin: 0 0 8px;
      display: flex; align-items: center; gap: 8px;
    }
    .cs-onboard-eq { display: inline-flex; gap: 2px; align-items: flex-end; height: 11px; }
    .cs-onboard-eq i {
      width: 2px; background: #5add71; border-radius: 1px;
      animation: cs-eq 1.1s ease-in-out infinite;
    }
    .cs-onboard-eq i:nth-child(1){height:40%;animation-delay:0s}
    .cs-onboard-eq i:nth-child(2){height:90%;animation-delay:.15s}
    .cs-onboard-eq i:nth-child(3){height:60%;animation-delay:.3s}
    .cs-onboard-eq i:nth-child(4){height:100%;animation-delay:.45s}
    .cs-onboard-eq i:nth-child(5){height:50%;animation-delay:.6s}
    @keyframes cs-eq { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
    .cs-onboard-title {
      margin: 0 0 6px; font-size: 1.7rem; font-weight: 700; letter-spacing: -0.01em;
    }
    .cs-onboard-title b { color: #f0c640; font-weight: 700; }
    .cs-onboard-sub {
      margin: 0 0 20px; font-size: 0.92rem; line-height: 1.5; color: rgba(232,244,224,0.72);
    }
    .cs-onboard-tips { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 10px; }
    .cs-onboard-tips li {
      display: flex; align-items: center; gap: 12px;
      font-size: 0.86rem; color: rgba(232,244,224,0.82);
    }
    .cs-onboard-keys { display: inline-flex; gap: 4px; flex: 0 0 auto; min-width: 92px; }
    .cs-kbd {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.64rem; line-height: 1;
      padding: 5px 7px; border-radius: 5px;
      background: #243318; border: 1px solid rgba(255,255,255,0.12);
      box-shadow: inset 0 -1px 0 rgba(0,0,0,0.35); color: #e8f4e0;
      white-space: nowrap;
    }
    .cs-kbd.cs-kbd--play { color: #5add71; border-color: rgba(90,221,113,0.4); }
    .cs-onboard-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .cs-onboard-primary {
      appearance: none; cursor: pointer;
      font-family: inherit; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.01em;
      padding: 12px 22px; border-radius: 10px;
      color: #16210d; background: #f0c640; border: 1px solid #f0c640;
      box-shadow: 0 6px 20px rgba(240,198,64,0.28);
      transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .cs-onboard-primary:hover { background: #f4d160; transform: translateY(-1px); box-shadow: 0 8px 26px rgba(240,198,64,0.36); }
    .cs-onboard-primary:active { transform: translateY(0); }
    .cs-onboard-ghost {
      appearance: none; cursor: pointer; background: transparent; border: none;
      font-family: inherit; font-size: 0.84rem; color: rgba(232,244,224,0.55);
      padding: 6px 4px; text-decoration: underline; text-underline-offset: 3px;
      transition: color 0.15s ease;
    }
    .cs-onboard-ghost:hover { color: rgba(232,244,224,0.9); }
    .cs-onboard-close {
      position: absolute; top: 12px; right: 14px;
      appearance: none; cursor: pointer; background: transparent; border: none;
      color: rgba(232,244,224,0.4); font-size: 1.1rem; line-height: 1; padding: 6px;
      border-radius: 6px; transition: color 0.15s ease, background 0.15s ease;
    }
    .cs-onboard-close:hover { color: #e8f4e0; background: rgba(255,255,255,0.06); }
    .cs-onboard-primary:focus-visible, .cs-onboard-ghost:focus-visible, .cs-onboard-close:focus-visible {
      outline: 2px solid #5add71; outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .cs-onboard-backdrop, .cs-onboard-card { transition: none; }
      .cs-onboard-eq i { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function buildOverlay() {
  const backdrop = document.createElement('div');
  backdrop.className = 'cs-onboard-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'cs-onboard-title');

  backdrop.innerHTML = `
    <div class="cs-onboard-card">
      <button class="cs-onboard-close" type="button" aria-label="Close welcome">✕</button>
      <p class="cs-onboard-eyebrow">
        <span class="cs-onboard-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        Welcome to the studio
      </p>
      <h1 class="cs-onboard-title" id="cs-onboard-title">Make music in <b>CONFUstudio</b></h1>
      <p class="cs-onboard-sub">
        A full studio, right in your browser — eight tracks, a deep synth, sampling,
        per-track FX, scenes, and song mode. Nothing to install. Here's the 10-second start:
      </p>
      <ul class="cs-onboard-tips">
        <li><span class="cs-onboard-keys"><span class="cs-kbd cs-kbd--play">Space</span></span> Press Play to hear the demo pattern</li>
        <li><span class="cs-onboard-keys"><span class="cs-kbd">1</span><span class="cs-kbd">–</span><span class="cs-kbd">8</span></span> Pick a track · <span class="cs-kbd">Q W E R…</span> switch pages</li>
        <li><span class="cs-onboard-keys"><span class="cs-kbd">A S D F…</span></span> Play notes on the on-screen keyboard</li>
        <li><span class="cs-onboard-keys"><span class="cs-kbd">?</span><span class="cs-kbd">AI</span></span> Open the guide, or ask the co-pilot for ideas</li>
      </ul>
      <div class="cs-onboard-actions">
        <button class="cs-onboard-primary" type="button" data-cs-play>▶ Start making music</button>
        <button class="cs-onboard-ghost" type="button" data-cs-skip>Explore on my own</button>
      </div>
    </div>
  `;
  return backdrop;
}

function showOnboarding({ startPlayback } = {}) {
  injectStyles();
  const backdrop = buildOverlay();
  document.body.appendChild(backdrop);
  // Force reflow so the enter transition runs.
  void backdrop.offsetWidth;
  backdrop.classList.add('cs-in');

  const primary = backdrop.querySelector('[data-cs-play]');
  primary?.focus();

  let closed = false;
  const close = (andPlay) => {
    if (closed) return;
    closed = true;
    markOnboarded();
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('cs-in');
    const remove = () => backdrop.remove();
    backdrop.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400); // fallback if transitionend doesn't fire
    if (andPlay) {
      try {
        startPlayback?.();
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
  backdrop.querySelector('.cs-onboard-close')?.addEventListener('click', () => close(false));
  backdrop.querySelector('[data-cs-skip]')?.addEventListener('click', () => close(false));
  primary?.addEventListener('click', () => close(true));
}

function defaultStartPlayback() {
  // Prefer the real transport button so audio unlocks under this user gesture.
  const btn = document.getElementById('btn-play');
  if (btn && !btn.classList.contains('active')) {
    btn.click();
  }
}

function init() {
  if (alreadyOnboarded()) return;
  // A shared-pattern arrival (`#s=…`) gets a tailored overlay from share.js
  // instead of this generic first-run tour — don't double up. (This runs before
  // share.js cleans the hash, since onboarding.js is loaded first.)
  if (/[#&]s=/.test(location.hash || '')) return;
  const run = () => showOnboarding({ startPlayback: defaultStartPlayback });
  // Let the app paint first so the overlay sits over a rendered studio.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 350), { once: true });
  } else {
    setTimeout(run, 350);
  }
}

init();
