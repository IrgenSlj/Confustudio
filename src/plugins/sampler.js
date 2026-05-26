import { registerPlugin } from './registry.js';

registerPlugin('sampler', {
  type: 'source',
  label: 'Sampler',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'trig', direction: 'in', signal: 'event', label: 'Trigger' },
  ],
  params: {
    sampleId: { default: null },
    start: { default: 0, min: 0, max: 1 },
    end: { default: 1, min: 0, max: 1 },
    pitch: { default: 60, min: 0, max: 127 },
    loop: { default: false },
    keyTracking: { default: false },
  },
});
