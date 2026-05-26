import { registerPlugin } from './registry.js';

registerPlugin('tone', {
  type: 'source',
  label: 'Tone Generator',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'pitch', direction: 'in', signal: 'control', label: 'Pitch' },
  ],
  params: {
    waveform: { default: 'triangle', values: ['sine', 'saw', 'square', 'triangle'] },
    pitch: { default: 60, min: 0, max: 127 },
    volume: { default: 0.72, min: 0, max: 1 },
  },
});
