// CONFUstudio — undo/redo history UI
import { createHistoryController } from './command-bus.js';

export function initHistoryUI(state, showToast) {
  const historyController = createHistoryController(100);
  let _historyIdx = -1;
  let _historyTotal = 0;
  let _checkpoints = [];

  function syncHistoryMeta() {
    const meta = historyController.getMeta();
    _historyIdx = meta.index;
    _historyTotal = meta.total;
    _checkpoints = meta.checkpoints;
  }

  function pushHistory(state) {
    historyController.push(state);
    syncHistoryMeta();
    updateUndoIndicator();
  }

  function undoHistory(state) {
    if (!historyController.undo(state)) return;
    syncHistoryMeta();
    updateUndoIndicator();
  }

  function redoHistory(state) {
    if (!historyController.redo(state)) return;
    syncHistoryMeta();
    updateUndoIndicator();
  }

  function markCheckpoint(label) {
    const entry = historyController.markCheckpoint(label);
    if (!entry) return;
    syncHistoryMeta();
    updateUndoIndicator();
    showToast(`Checkpoint: ${entry.label}`);
  }

  function updateUndoIndicator() {
    let ind = document.getElementById('undo-indicator');
    if (!ind) {
      ind = document.createElement('span');
      ind.id = 'undo-indicator';
      ind.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);padding:0 4px;line-height:36px;cursor:default;';
      const stopBtn = document.getElementById('btn-stop');
      if (stopBtn?.parentNode) stopBtn.parentNode.insertBefore(ind, stopBtn.nextSibling);
    }
    const available = _historyIdx;
    const total = _historyTotal;
    ind.textContent = total > 0 ? `\u21BA${available}` : '';
    ind.style.color = available > 0 ? 'var(--screen-text)' : 'var(--muted)';
    if (_checkpoints.length > 0) {
      const lines = _checkpoints
        .slice()
        .sort((a, b) => a.historyIdx - b.historyIdx)
        .map(c => {
          const marker = c.historyIdx === _historyIdx ? '> ' : '  ';
          const time = new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return `${marker}[${c.historyIdx}] ${c.label} (${time})`;
        });
      ind.title = lines.join('\n');
    } else {
      ind.title = '';
    }
  }

  const confustudioCommands = {
    execute: null,
    history: {
      undo() {
        undoHistory(state);
        return historyController.getMeta();
      },
      redo() {
        redoHistory(state);
        return historyController.getMeta();
      },
    },
  };

  return {
    historyController,
    pushHistory,
    undoHistory,
    redoHistory,
    markCheckpoint,
    updateUndoIndicator,
    syncHistoryMeta,
    get historyIdx() { return _historyIdx; },
    get historyTotal() { return _historyTotal; },
    confustudioCommands,
  };
}
