import { registerPlugin } from './registry.js';

registerPlugin('biquad', {
  type: 'processor',
  label: 'Biquad Filter',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'freq-mod', direction: 'in', signal: 'control', label: 'Freq Mod' },
  ],
  params: {
    type: { default: 'lowpass', values: ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf'] },
    freq: { default: 1000, min: 20, max: 20000, unit: 'Hz' },
    Q: { default: 0.707, min: 0.1, max: 20 },
  },
});
