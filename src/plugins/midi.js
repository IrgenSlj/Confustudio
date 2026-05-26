import { registerPlugin } from './registry.js';

registerPlugin('midi', {
  type: 'control',
  label: 'MIDI Input',
  ports: [
    { id: 'note', direction: 'out', signal: 'event', label: 'Note' },
    { id: 'gate', direction: 'out', signal: 'event', label: 'Gate' },
    { id: 'velo', direction: 'out', signal: 'control', label: 'Velocity' },
    { id: 'mod', direction: 'out', signal: 'control', label: 'Mod Wheel' },
    { id: 'pitch-bend', direction: 'out', signal: 'control', label: 'Pitch Bend' },
  ],
  params: {
    channel: { default: 1, min: 1, max: 16 },
    octaveShift: { default: 0, min: -4, max: 4 },
  },
});
