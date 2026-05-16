import {
  buildAssistantPrompt,
  chatAssistant,
  fetchAssistantContext,
  fetchAssistantProviders,
} from './assistant-client.js';

let _overlay = null;

export function getOverlay() {
  return _overlay;
}

function ensureOverlay() {
  if (_overlay?.isConnected) return _overlay;
  const overlay = document.createElement('div');
  overlay.id = 'studio-overlay';
  overlay.className = 'hidden';
  overlay.innerHTML = `
    <div class="studio-overlay-panel" role="dialog" aria-modal="true" aria-label="CONFUstudio overlay">
      <div class="studio-overlay-head">
        <div class="studio-overlay-title">CONFUstudio</div>
        <button class="studio-overlay-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="studio-overlay-body"></div>
    </div>
  `;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('.studio-overlay-close')) {
      closeOverlay();
    }
  });
  document.body.append(overlay);
  _overlay = overlay;
  return overlay;
}

export function closeOverlay() {
  if (_overlay) _overlay.classList.add('hidden');
}

export function openOverlay(hideZoomLens, title, content) {
  const overlay = ensureOverlay();
  hideZoomLens();
  overlay.querySelector('.studio-overlay-title').textContent = title;
  const body = overlay.querySelector('.studio-overlay-body');
  body.replaceChildren();
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content) {
    body.append(content);
  }
  overlay.classList.remove('hidden');
}

export async function openManualOverlay(hideZoomLens) {
  openOverlay(hideZoomLens, 'Guide', '<div class="studio-overlay-copy">Loading guide…</div>');
  try {
    const context = await fetchAssistantContext();
    const app = context?.app || {};
    const assistant = context?.assistant || {};
    const manual = context?.manual || {};
    const pages = manual.pages || [];
    const signalFlow = (manual.audioAndControl?.routing || []).map((item) => `<li>${item}</li>`).join('');
    const pageItems = pages.map((page) => `<li><strong>${page.title}</strong>: ${page.purpose}</li>`).join('');
    const quickStart = [
      'Power the audio engine, set BPM, and choose a page for the current task.',
      'Build or edit the pattern, then shape the selected track in Sound and Mixer.',
      'Use Scenes and Arranger to turn loops into a performance or song structure.',
      'Call the Assistant when you want producer-style direction grounded in the current project.',
    ]
      .map((step) => `<li>${step}</li>`)
      .join('');
    const assistantModes = (assistant.skills || [])
      .map((skill) => `<li><strong>${skill.id}</strong>: ${skill.purpose}</li>`)
      .join('');
    const wrapEl = document.createElement('div');
    wrapEl.innerHTML = `
      <div class="studio-overlay-copy">${app.description || 'CONFUstudio is a browser-first studio shell for sequencing, sampling, synthesis, routing, and performance.'}</div>
      <nav class="studio-manual-index">
        <button type="button" class="active" data-manual-tab="manual-quickstart">Quick Start</button>
        <button type="button" data-manual-tab="manual-overview">Overview</button>
        <button type="button" data-manual-tab="manual-pages">Pages</button>
        <button type="button" data-manual-tab="manual-routing">Routing</button>
        <button type="button" data-manual-tab="manual-assistant">Assistant</button>
      </nav>
      <div class="studio-manual-meta">
        <section class="studio-overlay-card">
          <h4>Instrument</h4>
          <p>CONFUsynth is the primary instrument. Use it as the core sequencer, sampler, and synth voice inside the studio shell.</p>
        </section>
        <section class="studio-overlay-card">
          <h4>Manual Type</h4>
          <p>Quick-start plus reference format, similar to modern hardware manuals that separate first-use flow from deeper parameter reference.</p>
        </section>
      </div>
      <div class="studio-overlay-grid">
        <section class="studio-overlay-card studio-manual-section" id="manual-quickstart">
          <h4>Quick Start</h4>
          <ul>${quickStart}</ul>
        </section>
        <section class="studio-overlay-card studio-manual-section hidden" id="manual-overview">
          <h4>Studio Overview</h4>
          <p>${assistant.contextSummary || 'Use CONFUsynth for sequencing, sampling, synthesis, routing, and mix decisions across the studio.'}</p>
        </section>
        <section class="studio-overlay-card studio-manual-section hidden" id="manual-pages">
          <h4>Page Reference</h4>
          <ul>${pageItems}</ul>
        </section>
        <section class="studio-overlay-card studio-manual-section hidden" id="manual-routing">
          <h4>Signal And Routing</h4>
          <ul>${signalFlow}</ul>
        </section>
        <section class="studio-overlay-card studio-manual-section hidden" id="manual-assistant">
          <h4>Assistant Modes</h4>
          <ul>${assistantModes}</ul>
        </section>
        <section class="studio-overlay-card studio-manual-section hidden" id="manual-rules">
          <h4>Operating Rules</h4>
          <ul>${(manual.assistantGuardrails || []).map((rule) => `<li>${rule}</li>`).join('')}</ul>
        </section>
      </div>
    `;
    wrapEl.querySelectorAll('[data-manual-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const targetId = button.dataset.manualTab;
        wrapEl.querySelectorAll('[data-manual-tab]').forEach((other) => {
          other.classList.toggle('active', other === button);
        });
        wrapEl.querySelectorAll('.studio-manual-section').forEach((section) => {
          section.classList.toggle('hidden', section.id !== targetId);
        });
      });
    });
    openOverlay(hideZoomLens, 'Guide', wrapEl);
  } catch (error) {
    openOverlay(
      hideZoomLens,
      'Guide',
      `<div class="studio-overlay-copy">${error?.message || 'Guide unavailable.'}</div>`,
    );
  }
}

export async function openAssistantOverlay(hideZoomLens, buildLiveContext) {
  const shell = document.createElement('div');
  shell.innerHTML = `
    <div class="studio-overlay-copy">Use the studio assistant as a producer partner. It can translate the current project state into sequencing, sound design, routing, arrangement, and mix actions grounded in what CONFUstudio can actually do.</div>
    <div class="studio-assistant-provider-row">
      <div class="studio-assistant-provider-block">
        <div class="studio-assistant-label">Provider</div>
        <select class="studio-assistant-provider"><option value="auto">Auto</option></select>
        <div class="studio-assistant-provider-note">Use a configured provider for live responses. Unconfigured backends stay hidden unless they are the only available options.</div>
      </div>
      <div class="studio-assistant-status">Checking…</div>
    </div>
    <div class="studio-assistant-toolbar">
      <button type="button" data-preset="producer">Producer</button>
      <button type="button" data-preset="sound">Sound Design</button>
      <button type="button" data-preset="arrangement">Arrangement</button>
      <button type="button" data-preset="mix">Mix</button>
      <button type="button" data-preset="workflow">Workflow</button>
    </div>
    <textarea class="studio-assistant-prompt" placeholder="Ask for a full production move, a patch idea, routing help, scene transitions, or a step-by-step plan."></textarea>
    <div class="studio-assistant-actions">
      <button type="button" class="studio-assistant-context">Use Current Context</button>
      <button type="button" class="studio-assistant-send">Ask Assistant</button>
    </div>
    <pre class="studio-assistant-output">Assistant ready.</pre>
  `;
  openOverlay(hideZoomLens, 'Assistant', shell);

  const providerSelect = shell.querySelector('.studio-assistant-provider');
  const promptEl = shell.querySelector('.studio-assistant-prompt');
  const outputEl = shell.querySelector('.studio-assistant-output');
  const contextBtn = shell.querySelector('.studio-assistant-context');
  const sendBtn = shell.querySelector('.studio-assistant-send');
  const providerStatus = shell.querySelector('.studio-assistant-status');
  const providerNote = shell.querySelector('.studio-assistant-provider-note');

  const presetPrompts = {
    producer:
      'Act like a senior music producer using CONFUstudio. Turn the current project into a stronger track with concrete next moves in sequencing, sound, scenes, arrangement, and mix.',
    sound:
      'Act like a sound designer. Use CONFUsynth and the studio tools to design a distinctive patch or sample treatment for the current context.',
    arrangement:
      'Act like an arrangement producer. Suggest a full section plan, pattern changes, and scene transitions for the current project.',
    mix: 'Act like a mix engineer and producer. Suggest level, panning, FX send, dynamics, and space moves that fit the current project.',
    workflow:
      'Act like a technical studio operator. Give the best next workflow steps inside CONFUstudio page by page, using the current project context.',
  };

  shell.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const text = presetPrompts[button.dataset.preset];
      if (text) promptEl.value = text;
    });
  });

  contextBtn.addEventListener('click', () => {
    promptEl.value = buildAssistantPrompt(buildLiveContext());
    promptEl.focus();
  });

  sendBtn.addEventListener('click', async () => {
    const message = promptEl.value.trim();
    if (!message) {
      outputEl.textContent = 'Enter a prompt first.';
      return;
    }
    sendBtn.disabled = true;
    outputEl.textContent = 'Thinking…';
    try {
      const response = await chatAssistant({
        provider: providerSelect.value || 'auto',
        message,
        context: buildLiveContext(),
      });
      outputEl.textContent = response?.text || 'No response text returned.';
    } catch (error) {
      outputEl.textContent = error?.message || 'Assistant request failed.';
    } finally {
      sendBtn.disabled = false;
    }
  });

  try {
    const data = await fetchAssistantProviders();
    const providers = Object.values(data?.providers || {});
    const configuredProviders = providers.filter((provider) => provider.configured);
    providerSelect.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = configuredProviders.length ? 'Auto' : 'Auto (none configured)';
    providerSelect.append(autoOption);
    (configuredProviders.length ? configuredProviders : providers).forEach((provider) => {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.configured ? provider.label : `${provider.label} (setup required)`;
      option.disabled = !provider.configured;
      providerSelect.append(option);
    });
    providerSelect.value = data?.defaultProvider || 'auto';
    const hasConfiguredProvider = configuredProviders.length > 0;
    sendBtn.disabled = !hasConfiguredProvider;
    if (!hasConfiguredProvider) {
      outputEl.textContent = 'Configure an assistant provider before sending prompts.';
      providerStatus.textContent = 'No provider configured';
      providerStatus.classList.add('unconfigured');
      providerNote.textContent =
        'Set up OpenAI, Anthropic, Local OpenAI-compatible, or Ollama in the environment to enable the studio assistant.';
    } else {
      const activeProvider =
        providers.find((provider) => provider.id === (data?.defaultProvider || '')) || configuredProviders[0];
      providerStatus.textContent = activeProvider ? `${activeProvider.label} ready` : 'Provider ready';
      providerStatus.classList.remove('unconfigured');
      providerNote.textContent =
        'Provider selection is trimmed to live backends so the panel stays focused on usable studio-assistant routes.';
    }
  } catch (error) {
    providerSelect.innerHTML = '<option value="auto">Auto</option>';
    sendBtn.disabled = true;
    outputEl.textContent = error?.message || 'Assistant provider metadata is unavailable.';
    providerStatus.textContent = 'Provider metadata unavailable';
    providerStatus.classList.add('unconfigured');
    providerNote.textContent = 'Assistant provider metadata could not be loaded from the local bridge.';
  }
}
