import { registerPlugin } from './registry.js';

registerPlugin('panner', {
  type: 'processor',
  label: 'Panner',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    pan: { default: 0, min: -1, max: 1 },
  },
});
