// Plugin Registry — runtime-registered DSP descriptors

const _registry = {};

export function registerPlugin(id, descriptor) {
  if (!id || !descriptor) throw new TypeError('registerPlugin(id, descriptor) required');
  if (_registry[id]) console.warn(`Plugin '${id}' already registered, overwriting`);
  _registry[id] = { id, ...descriptor };
}

export function getPlugin(id) {
  return _registry[id] || null;
}

export function listPlugins(filter) {
  const all = Object.values(_registry);
  return filter ? all.filter((p) => p.type === filter) : all;
}

export function hasPlugin(id) {
  return id in _registry;
}

export function getPluginDefaultParams(id) {
  const plugin = _registry[id];
  if (!plugin) return {};
  const params = {};
  for (const [key, def] of Object.entries(plugin.params)) {
    params[key] = def.default !== undefined ? def.default : null;
  }
  return params;
}
