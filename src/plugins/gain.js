import { registerPlugin } from './registry.js';

registerPlugin('gain', {
  type: 'processor',
  label: 'Gain',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'cv', direction: 'in', signal: 'control', label: 'CV' },
  ],
  params: {
    level: { default: 0.72, min: 0, max: 2 },
    mute: { default: false },
  },
});
