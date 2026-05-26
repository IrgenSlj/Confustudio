import { registerPlugin } from './registry.js';

registerPlugin('chorus', {
  type: 'processor',
  label: 'Chorus',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    rate: { default: 1, min: 0.1, max: 20, unit: 'Hz' },
    depth: { default: 0.5, min: 0, max: 1 },
    width: { default: 0.5, min: 0, max: 1 },
  },
});
