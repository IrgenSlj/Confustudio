import { registerPlugin } from './registry.js';

registerPlugin('oscillator', {
  type: 'source',
  label: 'Oscillator',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'pitch-mod', direction: 'in', signal: 'control', label: 'Pitch Mod' },
  ],
  params: {
    waveform: { default: 'triangle', values: ['sine', 'saw', 'square', 'triangle'] },
    pitch: { default: 60, min: 0, max: 127 },
    fine: { default: 0, min: -50, max: 50 },
  },
});
