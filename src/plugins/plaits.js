import { registerPlugin } from './registry.js';

registerPlugin('plaits', {
  type: 'source',
  label: 'Plaits Macro-oscillator',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'trig', direction: 'in', signal: 'event', label: 'Trigger' },
    { id: 'pitch', direction: 'in', signal: 'control', label: 'Pitch' },
  ],
  params: {
    engine: { default: 0, min: 0, max: 15 },
    timbre: { default: 0.5, min: 0, max: 1 },
    harmonics: { default: 0.5, min: 0, max: 1 },
    morph: { default: 0.5, min: 0, max: 1 },
  },
});
