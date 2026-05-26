import { registerPlugin } from './registry.js';

registerPlugin('eq-3band', {
  type: 'processor',
  label: '3-Band EQ',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    low: { default: 0, min: -12, max: 12, unit: 'dB' },
    mid: { default: 0, min: -12, max: 12, unit: 'dB' },
    high: { default: 0, min: -12, max: 12, unit: 'dB' },
    midFreq: { default: 1000, min: 200, max: 8000, unit: 'Hz' },
  },
});
