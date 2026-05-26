import { registerPlugin } from './registry.js';

registerPlugin('envelope', {
  type: 'control',
  label: 'Envelope',
  ports: [
    { id: 'out', direction: 'out', signal: 'control', label: 'Out' },
    { id: 'trigger', direction: 'in', signal: 'event', label: 'Trigger' },
    { id: 'gate', direction: 'in', signal: 'event', label: 'Gate' },
  ],
  params: {
    attack: { default: 0.01, min: 0, max: 10, unit: 's' },
    decay: { default: 0.2, min: 0, max: 10, unit: 's' },
    sustain: { default: 0.5, min: 0, max: 1 },
    release: { default: 0.3, min: 0, max: 10, unit: 's' },
    amount: { default: 0, min: 0, max: 1 },
    trigger: { default: 'note', values: ['note', 'gate', 'fill'] },
  },
});
