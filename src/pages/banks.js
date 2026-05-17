// src/pages/banks.js — Bank/Pattern browser

import { EVENTS, STATE_PATHS } from '../constants.js';

const BANK_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// ─── Pattern Chain State ───────────────────────────────────────────────────────
function getChain() {
  if (!window.__CONFUSTUDIO__.patternChain) {
    window.__CONFUSTUDIO__.patternChain = {
      steps: [], // [{bank:0-7, pattern:0-15, repeats:1-8, mute:false}]
      active: false, // chain mode overrides normal pattern selection
      currentStep: 0, // which chain step is currently playing
      loop: true, // loop at end vs stop
      _stepCount: 0, // internal tick counter
    };
  }
  return window.__CONFUSTUDIO__.patternChain;
}

// ─── MIDI SMF Encoder ─────────────────────────────────────────────────────────
function varLen(n) {
  const bytes = [];
  bytes.push(n & 0x7f);
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function encodeMIDI(state, bankIdx, patIdx) {
  const PPQ = 480;
  const STEP_TICKS = PPQ / 4; // 16th note = 120 ticks at 480 PPQ
  const BPM = state.bpm ?? 120;
  const tempoMicros = Math.round(60_000_000 / BPM);

  const events = [];
  // Tempo event at tick 0
  events.push({
    tick: 0,
    data: [0xff, 0x51, 0x03, (tempoMicros >> 16) & 0xff, (tempoMicros >> 8) & 0xff, tempoMicros & 0xff],
  });

  const pattern = state.project?.banks?.[bankIdx]?.patterns?.[patIdx];
  if (!pattern) return new Uint8Array(0);

  const tracks = pattern.kit?.tracks ?? [];
  tracks.forEach((track, ti) => {
    const ch = ti % 16;
    const stepLen = (track.trackLength > 0 ? track.trackLength : null) ?? pattern.length ?? 16;
    (track.steps ?? []).slice(0, stepLen).forEach((step, si) => {
      if (!step.active) return;
      const onTick = si * STEP_TICKS;
      const offTick = onTick + Math.round(STEP_TICKS * (step.gate ?? 0.5));
      const vel = step.velocity === 0 ? 63 : step.velocity === 1 ? 95 : 127;
      const note = step.note ?? track.pitch ?? 60;
      events.push({ tick: onTick, data: [0x90 | ch, note & 0x7f, vel] });
      events.push({ tick: offTick, data: [0x80 | ch, note & 0x7f, 0] });
    });
  });

  // Sort by tick, then note-offs before note-ons at same tick
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const aOff = (a.data[0] & 0xf0) === 0x80 ? 0 : 1;
    const bOff = (b.data[0] & 0xf0) === 0x80 ? 0 : 1;
    return aOff - bOff;
  });

  let prevTick = 0;
  const trackBytes = [];
  events.forEach((ev) => {
    const delta = ev.tick - prevTick;
    prevTick = ev.tick;
    varLen(delta).forEach((b) => trackBytes.push(b));
    ev.data.forEach((b) => trackBytes.push(b));
  });
  // End of track
  [0x00, 0xff, 0x2f, 0x00].forEach((b) => trackBytes.push(b));

  const header = [
    0x4d,
    0x54,
    0x68,
    0x64, // MThd
    0x00,
    0x00,
    0x00,
    0x06, // length 6
    0x00,
    0x00, // format 0
    0x00,
    0x01, // 1 track
    (PPQ >> 8) & 0xff,
    PPQ & 0xff,
  ];
  const trackLen = trackBytes.length;
  const trackHeader = [
    0x4d,
    0x54,
    0x72,
    0x6b, // MTrk
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >> 8) & 0xff,
    trackLen & 0xff,
  ];
  return new Uint8Array([...header, ...trackHeader, ...trackBytes]);
}

// ─── MIDI SMF Decoder ─────────────────────────────────────────────────────────
function decodeMIDI(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let pos = 0;

  function readUint32() {
    const v = view.getUint32(pos);
    pos += 4;
    return v;
  }
  function readUint16() {
    const v = view.getUint16(pos);
    pos += 2;
    return v;
  }
  function readUint8() {
    return view.getUint8(pos++);
  }
  function readVarLen() {
    let value = 0,
      b;
    do {
      b = readUint8();
      value = (value << 7) | (b & 0x7f);
    } while (b & 0x80);
    return value;
  }

  // Header
  if (readUint32() !== 0x4d546864) return null; // 'MThd'
  readUint32(); // header length (always 6)
  const format = readUint16();
  const numTracks = readUint16();
  const ppq = readUint16();

  const channelNotes = {}; // channel -> [{tick, note, velocity, duration}]

  for (let t = 0; t < numTracks; t++) {
    if (pos + 8 > arrayBuffer.byteLength) break;
    const chunkId = readUint32();
    const chunkLen = readUint32();
    if (chunkId !== 0x4d54726b) {
      pos += chunkLen;
      continue;
    } // 'MTrk'

    const chunkEnd = pos + chunkLen;
    let tick = 0;
    let runningStatus = 0;
    const noteOnTick = {}; // `${ch}-${note}` -> tick

    while (pos < chunkEnd) {
      const delta = readVarLen();
      tick += delta;
      let statusByte = view.getUint8(pos);

      if (statusByte & 0x80) {
        runningStatus = statusByte;
        pos++;
      } else {
        statusByte = runningStatus;
      }

      const type = statusByte & 0xf0;
      const ch = statusByte & 0x0f;

      if (type === 0xff) {
        // Meta event
        readUint8();
        const metaLen = readVarLen();
        pos += metaLen;
      } else if (type === 0xf0 || type === 0xf7) {
        // SysEx
        const sysLen = readVarLen();
        pos += sysLen;
      } else if (type === 0x90) {
        const note = readUint8();
        const vel = readUint8();
        if (vel > 0) {
          noteOnTick[`${ch}-${note}`] = { tick, vel };
        } else {
          // note-on with vel=0 treated as note-off
          const on = noteOnTick[`${ch}-${note}`];
          if (on) {
            if (!channelNotes[ch]) channelNotes[ch] = [];
            channelNotes[ch].push({ tick: on.tick, note, velocity: on.vel, duration: tick - on.tick });
            delete noteOnTick[`${ch}-${note}`];
          }
        }
      } else if (type === 0x80) {
        const note = readUint8();
        readUint8(); // off velocity
        const on = noteOnTick[`${ch}-${note}`];
        if (on) {
          if (!channelNotes[ch]) channelNotes[ch] = [];
          channelNotes[ch].push({ tick: on.tick, note, velocity: on.vel, duration: tick - on.tick });
          delete noteOnTick[`${ch}-${note}`];
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        pos += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        pos += 1;
      } else {
        pos++; // unknown, skip byte
      }
    }
    pos = chunkEnd;
  }

  const STEP_TICKS = ppq / 4; // 16th note ticks
  const tracks = Object.entries(channelNotes).map(([ch, notes]) => ({
    channel: parseInt(ch),
    notes: notes.map((n) => ({
      ...n,
      stepIndex: Math.round(n.tick / STEP_TICKS),
    })),
  }));

  return { format, ppq, tracks };
}

const TRACK_COLORS = ['#f0c640', '#5add71', '#67d7ff', '#ff8c52', '#c67dff', '#ff6eb4', '#40e0d0', '#f05b52'];

// ─── Pattern Canvas Thumbnail ─────────────────────────────────────────────────
function buildPatternThumbnail(pattern, trackColors) {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, 80, 32);

  if (!pattern?.kit?.tracks) return canvas;

  const tracks = pattern.kit.tracks.slice(0, 8);
  const rowH = 32 / 8;

  tracks.forEach((track, ti) => {
    const steps = track.steps ?? [];
    const color = trackColors[ti] ?? '#888';
    const dotW = 80 / 16;

    for (let si = 0; si < 16; si++) {
      const step = steps[si];
      const active = step?.active ?? false;
      const x = si * dotW + dotW * 0.15;
      const y = ti * rowH + rowH * 0.15;
      const w = dotW * 0.7;
      const h = rowH * 0.7;

      ctx.fillStyle = active ? color : 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, 1);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
    }
  });

  return canvas;
}

function computePatternDiff(patA, patB) {
  return patA.kit.tracks.map((trackA, ti) => {
    const trackB = patB.kit.tracks[ti];
    let added = 0,
      removed = 0;
    for (let si = 0; si < Math.max(patA.length, patB.length); si++) {
      const stepA = trackA.steps[si]?.active ?? false;
      const stepB = trackB?.steps[si]?.active ?? false;
      if (stepA && !stepB) removed++;
      else if (!stepA && stepB) added++;
    }
    return { name: trackA.name, added, removed, same: added + removed === 0 };
  });
}

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const { project, activeBank, activePattern, copyBuffer, patternCompareA, patternCompareB } = state;
    const hasPatternCopy = copyBuffer?.type === 'pattern';
    const executeCommands = (commands, label) => {
      if (window.confustudioCommands?.execute) {
        return window.confustudioCommands.execute(commands, label);
      }
      return null;
    };

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Banks</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--accent)">
        ${BANK_LETTERS[activeBank]}${String(activePattern + 1).padStart(2, '0')}
      </span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">
        ${project.banks[activeBank].patterns[activePattern].name}
      </span>`;
    container.append(header);

    // A/B Pattern Comparison bar
    const abBar = document.createElement('div');
    abBar.className = 'ab-compare-bar';

    const abLabel = document.createElement('label');
    abLabel.textContent = 'CMP:';
    abBar.append(abLabel);

    const markABtn = document.createElement('button');
    markABtn.className = 'ab-btn' + (patternCompareA ? ' has-a' : '');
    markABtn.textContent = patternCompareA
      ? `A:${BANK_LETTERS[patternCompareA.bank]}${String(patternCompareA.pattern + 1).padStart(2, '0')}`
      : 'Mark A';
    markABtn.title = 'Mark current pattern as A';
    markABtn.addEventListener('click', () => {
      state.patternCompareA = { bank: activeBank, pattern: activePattern };
      this.render(container, state, emit);
    });

    const markBBtn = document.createElement('button');
    markBBtn.className = 'ab-btn' + (patternCompareB ? ' has-b' : '');
    markBBtn.textContent = patternCompareB
      ? `B:${BANK_LETTERS[patternCompareB.bank]}${String(patternCompareB.pattern + 1).padStart(2, '0')}`
      : 'Mark B';
    markBBtn.title = 'Mark current pattern as B';
    markBBtn.addEventListener('click', () => {
      state.patternCompareB = { bank: activeBank, pattern: activePattern };
      this.render(container, state, emit);
    });

    const swapBtn = document.createElement('button');
    swapBtn.className = 'ab-btn';
    swapBtn.textContent = 'A↔B';
    swapBtn.title = 'Toggle between A and B pattern';
    const canSwap = !!(patternCompareA && patternCompareB);
    swapBtn.disabled = !canSwap;
    swapBtn.addEventListener('click', () => {
      const curr = { bank: activeBank, pattern: activePattern };
      const isOnA = patternCompareA && curr.bank === patternCompareA.bank && curr.pattern === patternCompareA.pattern;
      const target = isOnA ? patternCompareB : patternCompareA;
      if (target) {
        emit(EVENTS.BANK_SELECT, { bankIndex: target.bank });
        emit(EVENTS.PATTERN_SELECT, { patternIndex: target.pattern });
      }
    });

    const diffBtn = document.createElement('button');
    diffBtn.className = 'ab-btn';
    diffBtn.textContent = 'Diff';
    diffBtn.title = 'Show diff between pattern A and B';
    const canDiff = !!(patternCompareA && patternCompareB);
    diffBtn.disabled = !canDiff;
    diffBtn.style.opacity = canDiff ? '1' : '0.4';
    diffBtn.addEventListener('click', () => {
      const existing = container.querySelector('.ab-diff-panel');
      if (existing) {
        existing.remove();
        return;
      }

      const patA = state.project.banks[patternCompareA.bank].patterns[patternCompareA.pattern];
      const patB = state.project.banks[patternCompareB.bank].patterns[patternCompareB.pattern];
      const diffs = computePatternDiff(patA, patB);

      const diffPanel = document.createElement('div');
      diffPanel.className = 'ab-diff-panel';
      diffPanel.style.cssText =
        'background:#111;border:1px solid #2a2a2a;border-radius:4px;padding:6px 8px;margin-top:4px;font-family:var(--font-mono);font-size:0.48rem;display:flex;flex-direction:column;gap:3px';

      const diffTitle = document.createElement('div');
      diffTitle.style.cssText = 'color:var(--muted);font-size:0.44rem;margin-bottom:2px';
      diffTitle.textContent = `DIFF  A:${BANK_LETTERS[patternCompareA.bank]}${String(patternCompareA.pattern + 1).padStart(2, '0')}  vs  B:${BANK_LETTERS[patternCompareB.bank]}${String(patternCompareB.pattern + 1).padStart(2, '0')}`;
      diffPanel.append(diffTitle);

      diffs.forEach(({ name, added, removed, same }) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px';

        const trackLabel = document.createElement('span');
        trackLabel.style.cssText =
          'color:var(--screen-text);min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        trackLabel.textContent = name;
        row.append(trackLabel);

        if (same) {
          const sameBadge = document.createElement('span');
          sameBadge.style.cssText = 'color:var(--muted);font-size:0.44rem';
          sameBadge.textContent = 'same';
          row.append(sameBadge);
        } else {
          if (removed > 0) {
            const remBadge = document.createElement('span');
            remBadge.style.cssText =
              'background:rgba(240,91,82,0.2);color:#f05b52;border:1px solid rgba(240,91,82,0.4);border-radius:3px;padding:0 4px;font-size:0.44rem';
            remBadge.textContent = `-${removed} steps`;
            row.append(remBadge);
          }
          if (added > 0) {
            const addBadge = document.createElement('span');
            addBadge.style.cssText =
              'background:rgba(90,221,113,0.2);color:#5add71;border:1px solid rgba(90,221,113,0.4);border-radius:3px;padding:0 4px;font-size:0.44rem';
            addBadge.textContent = `+${added} steps`;
            row.append(addBadge);
          }
        }
        diffPanel.append(row);
      });

      // Insert after abBar
      abBar.after(diffPanel);
    });

    abBar.append(markABtn, markBBtn, swapBtn, diffBtn);
    container.append(abBar);

    // ── Chain Editor Panel ──────────────────────────────────────────────────
    const chain = getChain();

    // Tab switcher: BANKS view vs CHAIN view
    const tabRow = document.createElement('div');
    tabRow.style.cssText = 'display:flex;gap:3px;flex-shrink:0;margin-bottom:4px';

    const tabBanks = document.createElement('button');
    tabBanks.className = 'ab-btn' + (!state._chainEditorOpen ? ' has-a' : '');
    tabBanks.textContent = 'BANKS';
    tabBanks.style.cssText = 'flex:1;font-family:var(--font-mono);font-size:0.52rem';

    const tabChain = document.createElement('button');
    tabChain.className = 'ab-btn' + (state._chainEditorOpen ? ' has-a' : '');
    tabChain.textContent = 'CHAIN';
    tabChain.style.cssText = 'flex:1;font-family:var(--font-mono);font-size:0.52rem';

    tabRow.append(tabBanks, tabChain);
    container.append(tabRow);

    // Sections shown/hidden by tab
    const bankSection = document.createElement('div');
    bankSection.style.cssText = `display:${state._chainEditorOpen ? 'none' : 'flex'};flex-direction:column;gap:4px`;

    const chainSection = document.createElement('div');
    chainSection.style.cssText = `display:${state._chainEditorOpen ? 'flex' : 'none'};flex-direction:column;gap:4px;flex:1;overflow:hidden`;

    tabBanks.addEventListener('click', () => {
      state._chainEditorOpen = false;
      bankSection.style.display = 'flex';
      chainSection.style.display = 'none';
      tabBanks.classList.add('has-a');
      tabChain.classList.remove('has-a');
    });
    tabChain.addEventListener('click', () => {
      state._chainEditorOpen = true;
      bankSection.style.display = 'none';
      chainSection.style.display = 'flex';
      tabBanks.classList.remove('has-a');
      tabChain.classList.add('has-a');
    });

    // ── Chain Editor Contents ──────────────────────────────────────────────
    // Controls row: ACTIVE, LOOP, Add Step
    const chainCtrlRow = document.createElement('div');
    chainCtrlRow.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0';

    const chainActiveBtn = document.createElement('button');
    chainActiveBtn.className = 'ab-btn' + (chain.active ? ' has-a' : '');
    chainActiveBtn.textContent = chain.active ? 'ACTIVE' : 'INACTIVE';
    chainActiveBtn.title = 'Enable chain mode (overrides normal pattern selection)';
    chainActiveBtn.addEventListener('click', () => {
      chain.active = !chain.active;
      chain._stepCount = 0;
      chain.currentStep = 0;
      chainActiveBtn.textContent = chain.active ? 'ACTIVE' : 'INACTIVE';
      chainActiveBtn.className = 'ab-btn' + (chain.active ? ' has-a' : '');
    });

    const chainLoopBtn = document.createElement('button');
    chainLoopBtn.className = 'ab-btn' + (chain.loop ? ' has-a' : '');
    chainLoopBtn.textContent = chain.loop ? 'LOOP' : 'ONCE';
    chainLoopBtn.title = 'Loop chain vs play once';
    chainLoopBtn.addEventListener('click', () => {
      chain.loop = !chain.loop;
      chainLoopBtn.textContent = chain.loop ? 'LOOP' : 'ONCE';
      chainLoopBtn.className = 'ab-btn' + (chain.loop ? ' has-a' : '');
    });

    const addStepBtn = document.createElement('button');
    addStepBtn.className = 'seq-btn';
    addStepBtn.textContent = '+ Add Step';
    addStepBtn.style.cssText = 'font-family:var(--font-mono);font-size:0.5rem;margin-left:auto';
    addStepBtn.addEventListener('click', () => {
      chain.steps.push({ bank: activeBank, pattern: activePattern, repeats: 1, mute: false });
      renderChainList();
    });

    chainCtrlRow.append(chainActiveBtn, chainLoopBtn, addStepBtn);
    chainSection.append(chainCtrlRow);

    // Chain step list
    const chainListEl = document.createElement('div');
    chainListEl.style.cssText =
      'display:flex;flex-direction:column;gap:3px;overflow-y:auto;flex:1;min-height:80px;max-height:220px';
    chainSection.append(chainListEl);

    function renderChainList() {
      chainListEl.innerHTML = '';
      if (chain.steps.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText =
          'color:var(--muted);font-family:var(--font-mono);font-size:0.5rem;padding:8px;text-align:center';
        empty.textContent = 'No steps. Click "+ Add Step" to begin.';
        chainListEl.append(empty);
        return;
      }
      chain.steps.forEach((step, idx) => {
        const row = document.createElement('div');
        const isCurrent = chain.active && idx === chain.currentStep;
        row.style.cssText = `display:flex;align-items:center;gap:3px;padding:3px 4px;border-radius:3px;border:1px solid ${isCurrent ? 'rgba(240,198,64,0.5)' : '#2a2a2a'};background:${isCurrent ? 'rgba(240,198,64,0.07)' : '#111'};${step.mute ? 'opacity:0.45' : ''}`;

        const posLabel = document.createElement('span');
        posLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);min-width:14px';
        posLabel.textContent = String(idx + 1).padStart(2, '0');
        row.append(posLabel);

        const bankSel = document.createElement('select');
        bankSel.style.cssText =
          'background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 2px;font-family:var(--font-mono);font-size:0.5rem;width:40px';
        BANK_LETTERS.forEach((l, bi) => {
          const opt = document.createElement('option');
          opt.value = bi;
          opt.textContent = l;
          if (bi === step.bank) opt.selected = true;
          bankSel.append(opt);
        });
        bankSel.addEventListener('change', () => {
          step.bank = parseInt(bankSel.value);
        });
        row.append(bankSel);

        const patSel = document.createElement('select');
        patSel.style.cssText = bankSel.style.cssText + ';width:42px';
        for (let i = 0; i < 16; i++) {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = String(i + 1).padStart(2, '0');
          if (i === step.pattern) opt.selected = true;
          patSel.append(opt);
        }
        patSel.addEventListener('change', () => {
          step.pattern = parseInt(patSel.value);
        });
        row.append(patSel);

        // Repeat counter
        const repLabel = document.createElement('span');
        repLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.46rem;color:var(--muted)';
        repLabel.textContent = '\u00d7';
        const repMinus = document.createElement('button');
        repMinus.className = 'seq-btn';
        repMinus.textContent = '-';
        repMinus.style.cssText = 'font-size:0.6rem;padding:0 4px;line-height:1.2';
        const repVal = document.createElement('span');
        repVal.style.cssText =
          'font-family:var(--font-mono);font-size:0.5rem;min-width:10px;text-align:center;color:var(--screen-text)';
        repVal.textContent = step.repeats;
        const repPlus = document.createElement('button');
        repPlus.className = 'seq-btn';
        repPlus.textContent = '+';
        repPlus.style.cssText = repMinus.style.cssText;
        repMinus.addEventListener('click', () => {
          step.repeats = Math.max(1, step.repeats - 1);
          repVal.textContent = step.repeats;
        });
        repPlus.addEventListener('click', () => {
          step.repeats = Math.min(8, step.repeats + 1);
          repVal.textContent = step.repeats;
        });
        row.append(repLabel, repMinus, repVal, repPlus);

        // Mute toggle
        const muteBtn = document.createElement('button');
        muteBtn.className = 'seq-btn' + (step.mute ? ' active' : '');
        muteBtn.textContent = 'M';
        muteBtn.title = 'Mute this step (pattern advances but plays silently)';
        muteBtn.style.cssText = 'font-size:0.5rem;padding:1px 5px';
        muteBtn.addEventListener('click', () => {
          step.mute = !step.mute;
          renderChainList();
        });
        row.append(muteBtn);

        // Move up / down
        const upBtn = document.createElement('button');
        upBtn.className = 'seq-btn';
        upBtn.textContent = '\u25b2';
        upBtn.title = 'Move up';
        upBtn.style.cssText = 'font-size:0.5rem;padding:1px 4px';
        upBtn.disabled = idx === 0;
        upBtn.addEventListener('click', () => {
          if (idx === 0) return;
          [chain.steps[idx - 1], chain.steps[idx]] = [chain.steps[idx], chain.steps[idx - 1]];
          renderChainList();
        });

        const downBtn = document.createElement('button');
        downBtn.className = 'seq-btn';
        downBtn.textContent = '\u25bc';
        downBtn.title = 'Move down';
        downBtn.style.cssText = upBtn.style.cssText;
        downBtn.disabled = idx === chain.steps.length - 1;
        downBtn.addEventListener('click', () => {
          if (idx >= chain.steps.length - 1) return;
          [chain.steps[idx], chain.steps[idx + 1]] = [chain.steps[idx + 1], chain.steps[idx]];
          renderChainList();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'seq-btn';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Remove step';
        delBtn.style.cssText = 'font-size:0.6rem;padding:0 5px;color:#f05b52';
        delBtn.addEventListener('click', () => {
          chain.steps.splice(idx, 1);
          if (chain.currentStep >= chain.steps.length) chain.currentStep = 0;
          renderChainList();
        });

        row.append(upBtn, downBtn, delBtn);
        chainListEl.append(row);
      });
    }
    renderChainList();

    // Expose re-render so the clock handler can call it
    window.__CONFUSTUDIO__.renderChainList = renderChainList;

    container.append(chainSection);

    // ── Bank/Pattern Section (hidden when chain tab is active) ─────────────
    // Bank selector (A–H)
    const bankRow = document.createElement('div');
    bankRow.className = 'bank-tabs';
    bankRow.style.cssText = 'flex-shrink:0;margin-bottom:4px';
    BANK_LETTERS.forEach((letter, bi) => {
      const btn = document.createElement('button');
      btn.className = 'bank-tab' + (bi === activeBank ? ' active' : '');
      btn.textContent = letter;
      btn.addEventListener('click', () => {
        if (!executeCommands({ type: 'select-bank', bankIndex: bi }, `Selected bank ${letter}`)) {
          emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.ACTIVE_BANK, value: bi });
          emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.ACTIVE_PATTERN, value: 0 });
          this.render(container, { ...state, activeBank: bi, activePattern: 0 }, emit);
        }
      });
      bankRow.append(btn);
    });
    bankSection.append(bankRow);

    // Pattern grid (4×4 = 16 patterns)
    const patGrid = document.createElement('div');
    patGrid.className = 'banks-grid';
    patGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:1;overflow-y:auto';

    project.banks[activeBank].patterns.forEach((pat, pi) => {
      const btn = document.createElement('div');
      btn.className = 'bank-pattern-card' + (pi === activePattern ? ' active' : '');
      if (pi === activePattern && state.chainPatterns) {
        btn.classList.add('chain-active');
      }

      // A/B badges
      const isA = patternCompareA && patternCompareA.bank === activeBank && patternCompareA.pattern === pi;
      const isB = patternCompareB && patternCompareB.bank === activeBank && patternCompareB.pattern === pi;
      if (isA) {
        const badge = document.createElement('span');
        badge.className = 'ab-badge ab-badge-a';
        badge.textContent = 'A';
        btn.append(badge);
      }
      if (isB) {
        const badge = document.createElement('span');
        badge.className = 'ab-badge ab-badge-b';
        badge.textContent = 'B';
        // Offset B badge slightly if both A and B are on the same pattern
        if (isA) badge.style.left = '8px';
        btn.append(badge);
      }

      // Pattern number
      const num = document.createElement('div');
      num.className = 'bank-pat-num';
      num.textContent = String(pi + 1).padStart(2, '0');
      btn.append(num);

      // Canvas thumbnail
      const thumb = buildPatternThumbnail(pat, TRACK_COLORS);
      thumb.className = 'bank-pat-canvas';
      btn.append(thumb);

      // BPM
      const bpmEl = document.createElement('div');
      bpmEl.className = 'bank-pat-bpm';
      bpmEl.textContent = `${state.bpm ?? 120} BPM`;
      btn.append(bpmEl);

      // Keep name as hidden data attr for rename UX below
      const name = document.createElement('span');
      name.style.cssText = 'display:none';
      name.textContent = pat.name.replace(/^Pattern /, '');
      btn.append(name);

      // Follow action badge
      const followAction = pat.followAction ?? 'next';
      const followIcons = { next: '→', loop: '↺', stop: '■', random: '?' };
      const followBadge = document.createElement('span');
      followBadge.style.cssText =
        'position:absolute;bottom:2px;right:2px;font-size:0.45rem;opacity:0.6;color:var(--muted)';
      followBadge.textContent = followIcons[followAction] ?? '→';
      followBadge.style.cursor = 'pointer';
      followBadge.title = 'Click to cycle follow action: next → loop → stop → random';
      followBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const ACTIONS = ['next', 'loop', 'stop', 'random'];
        const current = pat.followAction ?? 'next';
        const idx = ACTIONS.indexOf(current);
        const nextFollowAction = ACTIONS[(idx + 1) % ACTIONS.length];
        if (
          !executeCommands(
            {
              type: 'update-pattern-meta',
              bankIndex: activeBank,
              patternIndex: pi,
              followAction: nextFollowAction,
            },
            'Updated follow action',
          )
        ) {
          pat.followAction = nextFollowAction;
        }
        const icons = { next: '→', loop: '↺', stop: '■', random: '?' };
        followBadge.textContent = icons[nextFollowAction];
        emit(EVENTS.STATE_CHANGE, { param: 'followAction' });
      });
      btn.style.position = 'relative';

      // Quick-clear button
      const clearBtn = document.createElement('button');
      clearBtn.className = 'bank-clear-btn';
      clearBtn.textContent = '×';
      clearBtn.title = 'Clear all steps in this pattern';
      clearBtn.style.cssText =
        'position:absolute;top:1px;right:18px;font-size:0.7rem;background:transparent;border:none;color:var(--muted);cursor:pointer;padding:0 2px;line-height:1;display:none;z-index:2';
      btn.addEventListener('mouseenter', () => (clearBtn.style.display = ''));
      btn.addEventListener('mouseleave', () => (clearBtn.style.display = 'none'));
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`Clear all steps in pattern ${pi + 1}?`)) return;
        const cleared = JSON.parse(JSON.stringify(pat));
        cleared.kit?.tracks?.forEach((t) =>
          t.steps?.forEach((s) => {
            s.active = false;
          }),
        );
        if (
          !executeCommands(
            {
              type: 'replace-pattern',
              bankIndex: activeBank,
              patternIndex: pi,
              pattern: cleared,
            },
            `Cleared pattern ${String(pi + 1).padStart(2, '0')}`,
          )
        ) {
          pat.kit.tracks?.forEach((t) =>
            t.steps?.forEach((s) => {
              s.active = false;
            }),
          );
          emit(EVENTS.STATE_CHANGE, { param: 'pattern' });
          this.render(container, state, emit);
        }
      });
      btn.append(followBadge, clearBtn);

      btn.addEventListener('click', () => {
        if (
          !executeCommands(
            {
              type: 'select-pattern',
              bankIndex: activeBank,
              patternIndex: pi,
            },
            `Selected pattern ${String(pi + 1).padStart(2, '0')}`,
          )
        ) {
          emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.ACTIVE_BANK, value: activeBank });
          emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.ACTIVE_PATTERN, value: pi });
          this.render(container, { ...state, activePattern: pi }, emit);
        }
      });

      btn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const originalName = pat.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName.replace(/^Pattern /, '');
        input.style.cssText =
          'font-family:var(--font-mono);font-size:0.52rem;background:rgba(0,0,0,0.6);border:none;color:white;width:100%;outline:none;text-align:center;padding:2px 4px;position:absolute;top:2px;left:0;right:0;z-index:3';
        btn.append(input);
        input.focus();
        input.select();

        const commit = () => {
          const trimmed = input.value.trim();
          const nextName = trimmed ? (trimmed.startsWith('Pattern ') ? trimmed : trimmed) : originalName;
          if (
            !executeCommands(
              {
                type: 'update-pattern-meta',
                bankIndex: activeBank,
                patternIndex: pi,
                name: nextName,
              },
              'Renamed pattern',
            )
          ) {
            const bank = state.project.banks[activeBank];
            bank.patterns[pi].name = nextName;
          }
          emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.EUCLID_BEATS, value: state.euclidBeats });
          this.render(container, { ...state }, emit);
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            input.blur();
          }
          if (ev.key === 'Escape') {
            input.removeEventListener('blur', commit);
            input.remove();
          }
        });
      });

      // Duplicate button per pattern row
      const dupBtn = document.createElement('button');
      dupBtn.className = 'seq-btn';
      dupBtn.textContent = '⧉';
      dupBtn.title = 'Duplicate pattern to next empty slot';
      dupBtn.style.cssText = 'font-size:0.6rem;padding:1px 4px;margin-top:2px';
      dupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const patterns = state.project.banks[activeBank].patterns;
        const isEmptyPattern = (p) => !p.kit?.tracks?.some((t) => t.steps?.some((s) => s.active));
        // Find first empty slot after current, then wrap around
        let targetIdx = -1;
        for (let i = pi + 1; i < patterns.length; i++) {
          if (isEmptyPattern(patterns[i])) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx === -1) {
          for (let i = 0; i < pi; i++) {
            if (isEmptyPattern(patterns[i])) {
              targetIdx = i;
              break;
            }
          }
        }
        // If still no empty slot, use next index (wrapping)
        if (targetIdx === -1) {
          targetIdx = (pi + 1) % patterns.length;
        }
        if (
          !executeCommands(
            {
              type: 'duplicate-pattern',
              sourceBankIndex: activeBank,
              sourcePatternIndex: pi,
              bankIndex: activeBank,
              patternIndex: targetIdx,
            },
            `Duplicated to slot ${String(targetIdx + 1).padStart(2, '0')}`,
          )
        ) {
          patterns[targetIdx] = JSON.parse(JSON.stringify(patterns[pi]));
          emit(EVENTS.STATE_CHANGE, { path: 'scale', value: state.scale });
          emit('toast', { msg: `Duplicated to slot ${String(targetIdx + 1).padStart(2, '0')}` });
        }
      });
      btn.append(dupBtn);

      patGrid.append(btn);
    });
    bankSection.append(patGrid);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-shrink:0';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'seq-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () =>
      emit(EVENTS.STATE_CHANGE, { path: 'action_copyPattern', value: { bank: activeBank, pattern: activePattern } }),
    );

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'seq-btn';
    pasteBtn.textContent = 'Paste';
    pasteBtn.disabled = !hasPatternCopy;
    pasteBtn.style.opacity = hasPatternCopy ? '1' : '0.4';
    pasteBtn.addEventListener('click', () =>
      emit(EVENTS.STATE_CHANGE, { path: 'action_pastePattern', value: { bank: activeBank, pattern: activePattern } }),
    );

    actions.append(copyBtn, pasteBtn);
    bankSection.append(actions);

    // Copy to Bank... section
    const copyToDiv = document.createElement('div');
    copyToDiv.style.cssText =
      'display:flex;align-items:center;gap:4px;padding:3px 4px;border-bottom:1px solid #2a2a2a;flex-shrink:0';

    const copyToLbl = document.createElement('label');
    copyToLbl.textContent = 'Copy to:';
    Object.assign(copyToLbl.style, { fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--muted)' });

    const bankSelect = document.createElement('select');
    bankSelect.style.cssText =
      'background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 4px;font-family:var(--font-mono);font-size:0.52rem';
    'ABCDEFGH'.split('').forEach((letter, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Bank ${letter}`;
      if (i === activeBank) opt.selected = true;
      bankSelect.append(opt);
    });

    const patSelect = document.createElement('select');
    patSelect.style.cssText = bankSelect.style.cssText;
    for (let i = 0; i < 16; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `P${String(i + 1).padStart(2, '0')}`;
      patSelect.append(opt);
    }

    const copyToBtn = document.createElement('button');
    copyToBtn.className = 'seq-btn';
    copyToBtn.textContent = 'Copy To →';
    copyToBtn.addEventListener('click', () => {
      const targetBank = parseInt(bankSelect.value);
      const targetPat = parseInt(patSelect.value);
      const src = state.project.banks[activeBank].patterns[activePattern];
      if (
        !executeCommands(
          {
            type: 'replace-pattern',
            bankIndex: targetBank,
            patternIndex: targetPat,
            pattern: JSON.parse(JSON.stringify(src)),
          },
          `Copied to ${BANK_LETTERS[targetBank]}${String(targetPat + 1).padStart(2, '0')}`,
        )
      ) {
        state.project.banks[targetBank].patterns[targetPat] = JSON.parse(JSON.stringify(src));
        emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.EUCLID_BEATS, value: state.euclidBeats });
      }
    });

    copyToDiv.append(copyToLbl, bankSelect, patSelect, copyToBtn);
    bankSection.append(copyToDiv);

    // Pattern info panel
    const infoPanel = document.createElement('div');
    infoPanel.className = 'pattern-info-panel';
    const pat = project.banks[activeBank].patterns[activePattern];
    const activeTracks = pat.kit.tracks.filter((t) => t.steps.some((s) => s.active)).length;
    const totalSteps = pat.kit.tracks.reduce((sum, t) => sum + t.steps.filter((s) => s.active).length, 0);
    infoPanel.innerHTML = `
      <span class="pinfo-name">${pat.name}</span>
      <span class="pinfo-stat">${pat.length} steps</span>
      <span class="pinfo-stat">${activeTracks} tracks</span>
      <span class="pinfo-stat">${totalSteps} notes</span>
    `;

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'seq-btn';
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Export pattern as JSON';
    exportBtn.style.cssText = 'font-size:0.5rem;padding:2px 6px';
    exportBtn.addEventListener('click', () => {
      const bankName = BANK_LETTERS[activeBank];
      const patternName = pat.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `confustudio-pattern-${bankName}-${patternName}.json`;
      const blob = new Blob([JSON.stringify(pat, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import button
    const importBtn = document.createElement('button');
    importBtn.className = 'seq-btn';
    importBtn.textContent = 'Import';
    importBtn.title = 'Import pattern from JSON file';
    importBtn.style.cssText = 'font-size:0.5rem;padding:2px 6px';
    importBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target.result);
            if (!imported.kit) {
              emit('toast', { msg: 'Invalid pattern: missing kit' });
              return;
            }
            if (
              !executeCommands(
                {
                  type: 'replace-pattern',
                  bankIndex: activeBank,
                  patternIndex: activePattern,
                  pattern: JSON.parse(JSON.stringify(imported)),
                },
                'Pattern imported',
              )
            ) {
              const target = state.project.banks[activeBank].patterns[activePattern];
              Object.assign(target, JSON.parse(JSON.stringify(imported)));
              emit(EVENTS.STATE_CHANGE, { path: 'scale', value: state.scale });
              emit('toast', { msg: 'Pattern imported' });
            }
          } catch (err) {
            emit('toast', { msg: 'Import failed: invalid JSON' });
          }
        };
        reader.readAsText(file);
      });
      document.body.appendChild(fileInput);
      fileInput.click();
      document.body.removeChild(fileInput);
    });

    // MIDI Export button
    const midiExportBtn = document.createElement('button');
    midiExportBtn.className = 'seq-btn';
    midiExportBtn.textContent = 'MIDI';
    midiExportBtn.title = 'Export pattern as MIDI file (.mid)';
    midiExportBtn.style.cssText = 'font-size:0.5rem;padding:2px 6px';
    midiExportBtn.addEventListener('click', () => {
      const midi = encodeMIDI(state, activeBank, activePattern);
      if (!midi.length) {
        emit('toast', { msg: 'Nothing to export' });
        return;
      }
      const bankName = BANK_LETTERS[activeBank];
      const filename = `confustudio_${bankName}${String(activePattern + 1).padStart(2, '0')}.mid`;
      const blob = new Blob([midi], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      emit('toast', { msg: `Exported ${filename}` });
    });

    // MIDI Import button
    const midiImportBtn = document.createElement('button');
    midiImportBtn.className = 'seq-btn';
    midiImportBtn.textContent = 'MIDI In';
    midiImportBtn.title = 'Import MIDI file into current pattern';
    midiImportBtn.style.cssText = 'font-size:0.5rem;padding:2px 6px';
    midiImportBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.mid,.midi';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const decoded = decodeMIDI(ev.target.result);
          if (!decoded) {
            emit('toast', { msg: 'MIDI import failed: invalid file' });
            return;
          }
          const targetPat = state.project.banks[activeBank].patterns[activePattern];
          const patTracks = targetPat.kit?.tracks ?? [];
          let notesImported = 0;
          decoded.tracks.forEach((midiTrack) => {
            const ch = midiTrack.channel;
            const trackObj = patTracks[ch % patTracks.length];
            if (!trackObj) return;
            const patLen = (trackObj.trackLength > 0 ? trackObj.trackLength : null) ?? targetPat.length ?? 16;
            // Clear existing steps in range
            trackObj.steps?.slice(0, patLen).forEach((s) => {
              s.active = false;
            });
            midiTrack.notes.forEach((n) => {
              const si = n.stepIndex;
              if (si >= 0 && si < patLen && trackObj.steps[si]) {
                trackObj.steps[si].active = true;
                trackObj.steps[si].note = n.note;
                trackObj.steps[si].velocity = n.velocity >= 110 ? 2 : n.velocity >= 80 ? 1 : 0;
                notesImported++;
              }
            });
          });
          if (
            !executeCommands(
              {
                type: 'replace-pattern',
                bankIndex: activeBank,
                patternIndex: activePattern,
                pattern: JSON.parse(JSON.stringify(targetPat)),
              },
              `MIDI imported: ${notesImported} notes`,
            )
          ) {
            emit(EVENTS.STATE_CHANGE, { path: 'scale', value: state.scale });
            emit('toast', { msg: `MIDI imported: ${notesImported} notes` });
          }
        };
        reader.readAsArrayBuffer(file);
      });
      document.body.appendChild(fileInput);
      fileInput.click();
      document.body.removeChild(fileInput);
    });

    infoPanel.append(exportBtn, importBtn, midiExportBtn, midiImportBtn);
    bankSection.append(infoPanel);

    container.append(bankSection);
  },

  knobMap: [
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
  ],

  keyboardContext: 'banks', // A↔B swap: use Mark A / Mark B / A↔B buttons above pattern grid
};
