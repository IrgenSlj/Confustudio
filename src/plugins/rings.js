import { registerPlugin } from './registry.js';

registerPlugin('rings', {
  type: 'source',
  label: 'Rings Resonator',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'trig', direction: 'in', signal: 'event', label: 'Trigger' },
    { id: 'pitch', direction: 'in', signal: 'control', label: 'Pitch' },
  ],
  params: {
    structure: { default: 0.5, min: 0, max: 1 },
    brightness: { default: 0.7, min: 0, max: 1 },
    damping: { default: 0.7, min: 0, max: 1 },
    exciter: { default: 0, min: 0, max: 1 },
  },
});
