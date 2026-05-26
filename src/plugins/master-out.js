import { registerPlugin } from './registry.js';

registerPlugin('master-out', {
  type: 'sink',
  label: 'Master Output',
  ports: [{ id: 'in', direction: 'in', signal: 'audio', label: 'In' }],
  params: {
    level: { default: 0.82, min: 0, max: 2 },
    drive: { default: 0, min: 0, max: 1 },
  },
});
