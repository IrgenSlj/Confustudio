import { registerPlugin } from './registry.js';

registerPlugin('saturator', {
  type: 'processor',
  label: 'Saturator',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    drive: { default: 0, min: 0, max: 1 },
  },
});
