import { registerPlugin } from './registry.js';

registerPlugin('clouds', {
  type: 'source',
  label: 'Clouds Granular',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'trig', direction: 'in', signal: 'event', label: 'Trigger' },
  ],
  params: {
    position: { default: 0.5, min: 0, max: 1 },
    size: { default: 0.3, min: 0, max: 1 },
    density: { default: 0.5, min: 0, max: 1 },
    texture: { default: 0.5, min: 0, max: 1 },
  },
});
