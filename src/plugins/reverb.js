import { registerPlugin } from './registry.js';

registerPlugin('reverb', {
  type: 'processor',
  label: 'Convolution Reverb',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
  ],
  params: {
    mix: { default: 0.3, min: 0, max: 1 },
    preDelay: { default: 0, min: 0, max: 0.5, unit: 's' },
    preset: { default: 'room', values: ['room', 'hall', 'plate', 'spring', 'cave', 'studio'] },
  },
});
