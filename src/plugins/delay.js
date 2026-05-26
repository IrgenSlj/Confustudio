import { registerPlugin } from './registry.js';

registerPlugin('delay', {
  type: 'processor',
  label: 'Delay',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'return', direction: 'in', signal: 'audio', label: 'Return' },
  ],
  params: {
    time: { default: 0.28, min: 0.01, max: 2, unit: 's' },
    feedback: { default: 0.38, min: 0, max: 1 },
    sync: { default: false },
    syncDiv: { default: '1/8', values: ['1/4', '1/8', '1/8t', '1/16', '1/32'] },
    mix: { default: 0.3, min: 0, max: 1 },
  },
});
