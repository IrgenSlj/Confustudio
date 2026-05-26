import { registerPlugin } from './registry.js';

registerPlugin('bitcrusher', {
  type: 'processor',
  label: 'Bitcrusher',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    bitDepth: { default: 32, min: 4, max: 32 },
    srDiv: { default: 1, min: 1, max: 16 },
  },
});
