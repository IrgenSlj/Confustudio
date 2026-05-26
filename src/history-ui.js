// CONFUstudio — undo/redo history via signal-graph replay
import { createSignalGraph } from './state.js';
import { replaySignalSubgraph, signalUndo, signalRedo } from './command-bus.js';

export function initHistoryUI(state, showToast) {
  if (!state._signalGraph) {
    state._signalGraph = createSignalGraph();
  }

  let _historyIdx = 0;
  let _historyTotal = 0;
  const _checkpoints = [];
  const _checkpointIdCounter = 1;

  function updateMeta() {
    const graph = state._signalGraph;
    if (!graph) {
      _historyIdx = 0;
      _historyTotal = 0;
      return;
    }
    const cursorPos = graph.cursorId != null
      ? graph.nodes.findIndex((n) => n.id === graph.cursorId) + 1
      : 0;
    _historyIdx = Math.max(0, cursorPos);
    _historyTotal = graph.nodes.length;
  }

  function pushHistory(state) {
    updateMeta();
    updateUndoIndicator();
  }

  function undoHistory(state) {
    const graph = state._signalGraph;
    if (!graph) return;
    const newId = signalUndo(graph);
    if (newId == null) return;
    replaySignalSubgraph(state, graph, newId, { inPlace: true });
    updateMeta();
    updateUndoIndicator();
  }

  function redoHistory(state) {
    const graph = state._signalGraph;
    if (!graph) return;
    const newId = signalRedo(graph);
    if (newId == null) return;
    replaySignalSubgraph(state, graph, newId, { inPlace: true });
    updateMeta();
    updateUndoIndicator();
  }

  function markCheckpoint(label) {
    if (_historyTotal === 0) return;
    const entry = { historyIdx: _historyIdx, label: label || 'Checkpoint', timestamp: Date.now() };
    const existing = _checkpoints.findIndex((item) => item.historyIdx === _historyIdx);
    if (existing >= 0) _checkpoints[existing] = entry;
    else _checkpoints.push(entry);
    updateUndoIndicator();
    showToast(`Checkpoint: ${entry.label}`);
  }

  function updateUndoIndicator() {
    let ind = document.getElementById('undo-indicator');
    if (!ind) {
      ind = document.createElement('span');
      ind.id = 'undo-indicator';
      ind.style.cssText =
        'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);padding:0 4px;line-height:36px;cursor:default;';
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
        .map((c) => {
          const marker = c.historyIdx === _historyIdx ? '> ' : '  ';
          const time = new Date(c.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
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
        return getMeta();
      },
      redo() {
        redoHistory(state);
        return getMeta();
      },
    },
  };

  function getMeta() {
    return {
      index: _historyIdx,
      total: _historyTotal,
      checkpoints: _checkpoints.slice(),
    };
  }

  return {
    historyController: { getMeta, push: () => {}, undo: () => {}, redo: () => {}, markCheckpoint },
    pushHistory,
    undoHistory,
    redoHistory,
    markCheckpoint,
    updateUndoIndicator,
    syncHistoryMeta: updateMeta,
    get historyIdx() {
      return _historyIdx;
    },
    get historyTotal() {
      return _historyTotal;
    },
    confustudioCommands,
  };
}
