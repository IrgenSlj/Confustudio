// CONFUstudio — recorder / audio capture functions
import { getActivePattern } from './state.js';

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function resetRecorderSlotMeta(slotIndex) {
  return {
    name: `Slot ${slotIndex + 1}`,
    source: null,
    trackIndex: null,
    durationSec: 0,
    createdAt: null,
    trimStart: 0,
    trimEnd: 1,
    reversed: false,
    normalized: false,
    editedAt: null,
  };
}

export function getRecorderDurationMs(state, bars) {
  const bpm = Math.max(40, Number(state.bpm) || 120);
  const safeBars = Math.max(1, Math.min(32, Number(bars) || 4));
  return Math.round((240000 / bpm) * safeBars);
}

export async function captureRecorderSlot(state, slotIndex, options = {}, deps) {
  const { ensureAudio, showToast, scheduleSave, renderPage } = deps;
  await ensureAudio();
  if (!state.engine?.master || !state.audioContext || state._recorderCaptureActive) return false;

  const bars = options.bars ?? state.recorderBarCount ?? 4;
  const durationMs = getRecorderDurationMs(state, bars);
  const mediaDest = state.audioContext.createMediaStreamDestination();
  const mimeType =
    ['audio/webm;codecs=opus', 'audio/webm'].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';

  state.engine.master.connect(mediaDest);
  const recorder = new MediaRecorder(mediaDest.stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  state._recorderCaptureActive = { slotIndex, startedAt: Date.now(), durationMs };

  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      state._recorderCaptureActive = null;
      try {
        state.engine.master.disconnect(mediaDest);
      } catch (_) {}
      showToast('Capture failed');
      resolve(false);
    };
    recorder.onstop = async () => {
      state._recorderCaptureActive = null;
      try {
        state.engine.master.disconnect(mediaDest);
      } catch (_) {}
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      if (!blob.size) {
        showToast('Capture empty');
        resolve(false);
        return;
      }
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await state.audioContext.decodeAudioData(arrayBuffer.slice(0));
        state.recorderBuffers[slotIndex] = decoded;
        state.recorderSlotsMeta[slotIndex] = {
          ...state.recorderSlotsMeta[slotIndex],
          source: options.source ?? 'master',
          trackIndex: options.trackIndex ?? null,
          durationSec: decoded.duration,
          createdAt: Date.now(),
          bars,
        };
        scheduleSave();
        renderPage();
        showToast(`Captured slot ${slotIndex + 1}`);
        resolve(true);
      } catch (error) {
        console.warn('Recorder decode failed:', error);
        showToast('Capture decode failed');
        resolve(false);
      }
    };

    recorder.start();
    showToast(`Capturing ${bars} bars...`, Math.max(1400, durationMs));
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
}

export function loadRecorderSlotToTrack(state, slotIndex, trackIndex, deps) {
  const { showToast, scheduleSave, renderPage } = deps;
  const buffer = state.recorderBuffers?.[slotIndex];
  const track = getActivePattern(state).kit.tracks[trackIndex];
  if (!buffer || !track) return false;
  track.machine = 'sample';
  track.sampleBuffer = buffer;
  track.sampleStart = 0;
  track.sampleEnd = 1;
  track.loopStart = 0;
  track.loopEnd = 1;
  track.loopEnabled = false;
  scheduleSave();
  renderPage();
  showToast(`Loaded slot ${slotIndex + 1} \u2192 T${trackIndex + 1}`);
  return true;
}

export function exportRecorderSlot(state, slotIndex) {
  const buffer = state.recorderBuffers?.[slotIndex];
  if (!buffer) return false;
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  const wav = encodeWav(channels, buffer.sampleRate);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `confustudio-slot-${slotIndex + 1}.wav`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function encodeWav(channelData, sampleRate) {
  const channels = channelData.length;
  const frameCount = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + frameCount * blockAlign);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * blockAlign, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, frameCount * blockAlign, true);
  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}
