import { registerPlugin } from './registry.js';

registerPlugin('lfo', {
  type: 'control',
  label: 'LFO',
  ports: [
    { id: 'out', direction: 'out', signal: 'control', label: 'Out' },
    { id: 'sync', direction: 'in', signal: 'event', label: 'Sync' },
  ],
  params: {
    rate: { default: 2, min: 0.01, max: 50, unit: 'Hz' },
    shape: { default: 'sine', values: ['sine', 'triangle', 'saw', 'square', 's&h'] },
    depth: { default: 0, min: 0, max: 1 },
    destination: { default: 'cutoff' },
  },
});
