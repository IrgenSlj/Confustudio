import { registerPlugin } from './registry.js';

registerPlugin('compressor', {
  type: 'processor',
  label: 'Compressor',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    threshold: { default: -24, min: -60, max: 0, unit: 'dB' },
    ratio: { default: 4, min: 1, max: 20 },
    attack: { default: 0.003, min: 0.001, max: 2, unit: 's' },
    release: { default: 0.25, min: 0.001, max: 2, unit: 's' },
    makeup: { default: 0, min: 0, max: 24, unit: 'dB' },
  },
});
