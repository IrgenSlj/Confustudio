import { registerPlugin } from './registry.js';

registerPlugin('noise', {
  type: 'source',
  label: 'Noise',
  ports: [{ id: 'out', direction: 'out', signal: 'audio', label: 'Out' }],
  params: {
    color: { default: 'white', values: ['white', 'pink', 'brown'] },
    level: { default: 0.72, min: 0, max: 1 },
  },
});
