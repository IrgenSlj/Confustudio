// DSP Module — generic UI for signal graph plugin nodes
import { getPlugin, listPlugins } from '../plugins/index.js';

const PARAM_KNOB_MAP = {
  level: { min: 0, max: 1, step: 0.01, label: 'Level' },
  volume: { min: 0, max: 1, step: 0.01, label: 'Volume' },
  mix: { min: 0, max: 1, step: 0.01, label: 'Mix' },
  frequency: { min: 0, max: 20000, step: 1, label: 'Freq', scale: 'log' },
  feedback: { min: 0, max: 1, step: 0.01, label: 'Feedback' },
  drive: { min: 0, max: 1, step: 0.01, label: 'Drive' },
  pan: { min: -1, max: 1, step: 0.01, label: 'Pan' },
};

function getParamKnobInfo(key, paramDef) {
  const mapped = PARAM_KNOB_MAP[key];
  if (mapped) return mapped;
  return {
    min: paramDef.min ?? 0,
    max: paramDef.max ?? 1,
    step: (paramDef.max - paramDef.min) / 100,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  };
}

export function createDSPModule(pluginId, params) {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    const el = document.createElement('div');
    el.textContent = `Unknown: ${pluginId}`;
    return el;
  }

  const container = document.createElement('div');
  container.className = 'dsp-module';
  container.style.cssText = `
    width: 220px;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 6px;
    font-family: monospace;
    font-size: 11px;
    color: #ccc;
    overflow: hidden;
  `;

  // Title bar
  const title = document.createElement('div');
  title.style.cssText = `
    background: #16213e;
    padding: 6px 10px;
    font-weight: bold;
    font-size: 12px;
    color: #67d7ff;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  title.innerHTML = `<span>${plugin.label}</span><span style="font-size:9px;color:#666">${plugin.type}</span>`;
  container.appendChild(title);

  // Port indicators
  const portBar = document.createElement('div');
  portBar.style.cssText = `
    display: flex;
    gap: 8px;
    padding: 4px 10px;
    background: #0f0f23;
    border-bottom: 1px solid #222;
  `;
  for (const port of plugin.ports) {
    const dot = document.createElement('span');
    const color = port.direction === 'in' ? '#5add71' : '#ff8c52';
    dot.className = 'port';
    dot.dataset.port = port.id;
    dot.title = `${port.label} (${port.direction})`;
    dot.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 9px;
      color: ${color};
      cursor: crosshair;
    `;
    dot.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};border:1px solid rgba(255,255,255,0.2)"></span> ${port.label}`;
    portBar.appendChild(dot);
  }
  container.appendChild(portBar);

  // Parameter controls
  const paramKeys = Object.keys(plugin.params);
  if (paramKeys.length > 0) {
    const paramsDiv = document.createElement('div');
    paramsDiv.style.cssText = `padding: 6px 10px;`;
    for (const key of paramKeys) {
      const def = plugin.params[key];
      const knobInfo = getParamKnobInfo(key, def);
      const val = params?.[key] ?? def.default ?? 0;

      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      `;

      const label = document.createElement('label');
      label.textContent = knobInfo.label;
      label.style.cssText = `width: 70px; flex-shrink: 0; color: #888;`;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = knobInfo.min;
      slider.max = knobInfo.max;
      slider.step = knobInfo.step;
      slider.value = val;
      slider.dataset.param = key;
      slider.style.cssText = `
        flex: 1;
        height: 4px;
        accent-color: #67d7ff;
        cursor: pointer;
      `;

      const valueLabel = document.createElement('span');
      valueLabel.textContent = typeof val === 'number' ? val.toFixed(2) : val;
      valueLabel.style.cssText = `width: 40px; text-align: right; color: #aaa; font-size: 10px;`;

      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        valueLabel.textContent = typeof v === 'number' ? v.toFixed(2) : v;
        container.dispatchEvent(new CustomEvent('dsp:paramchange', {
          detail: { key, value: v },
          bubbles: true,
        }));
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueLabel);
      paramsDiv.appendChild(row);
    }
    container.appendChild(paramsDiv);
  }

  // Expose module API for state serialization
  container.__confustudioModule = {
    serialize() {
      const values = {};
      container.querySelectorAll('input[data-param]').forEach((inp) => {
        values[inp.dataset.param] = Number(inp.value);
      });
      return { pluginId, params: values };
    },
    restore(saved) {
      if (saved?.params) {
        container.querySelectorAll('input[data-param]').forEach((inp) => {
          const key = inp.dataset.param;
          if (saved.params[key] !== undefined) {
            inp.value = saved.params[key];
          }
        });
      }
    },
  };

  return container;
}

/**
 * Build plugin list categorized by type for the module picker.
 */
export function getDSPPluginSections() {
  const plugins = listPlugins();
  const sections = {};
  for (const p of plugins) {
    const cat = p.type === 'source' ? 'SOURCES' :
      p.type === 'effect' || p.type === 'processor' ? 'EFFECTS' :
      'CONTROL';
    if (!sections[cat]) sections[cat] = [];
    sections[cat].push(p);
  }
  return sections;
}
