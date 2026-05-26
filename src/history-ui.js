// CONFUstudio — undo/redo history via signal-graph replay
import { createSignalGraph } from './state.js';
import {
  replaySignalSubgraph,
  signalUndo,
  signalRedo,
  signalListBranches,
  signalSwitchBranch,
} from './command-bus.js';

export function initHistoryUI(state, showToast) {
  if (!state._signalGraph) {
    state._signalGraph = createSignalGraph();
  }

  let _historyIdx = 0;
  let _historyTotal = 0;
  let _branchCount = 0;
  const _checkpoints = [];

  function updateMeta() {
    const graph = state._signalGraph;
    if (!graph) {
      _historyIdx = 0;
      _historyTotal = 0;
      _branchCount = 0;
      return;
    }
    const cursorPos = graph.cursorId != null
      ? graph.nodes.findIndex((n) => n.id === graph.cursorId) + 1
      : 0;
    _historyIdx = Math.max(0, cursorPos);
    _historyTotal = graph.nodes.length;
    _branchCount = signalListBranches(graph).length;
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

  /**
   * Switch to a specific branch child. Shows the node summary as toast.
   */
  function switchToBranch(childNodeId) {
    const graph = state._signalGraph;
    if (!graph) return false;
    const branches = signalListBranches(graph);
    const target = branches.find((b) => b.id === childNodeId);
    if (!target) return false;
    signalSwitchBranch(graph, childNodeId);
    replaySignalSubgraph(state, graph, childNodeId, { inPlace: true });
    updateMeta();
    updateUndoIndicator();
    showToast(target.summary || target.type);
    return true;
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
    const branchInfo = _branchCount > 1 ? ` \u2442${_branchCount}` : '';
    ind.textContent = total > 0 ? `\u21BA${available}${branchInfo}` : '';
    ind.style.color = available > 0 ? 'var(--screen-text)' : 'var(--muted)';
    const lines = [];
    if (_checkpoints.length > 0) {
      const sorted = _checkpoints.slice().sort((a, b) => a.historyIdx - b.historyIdx);
      sorted.forEach((c) => {
        const marker = c.historyIdx === _historyIdx ? '> ' : '  ';
        const time = new Date(c.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        lines.push(`${marker}[${c.historyIdx}] ${c.label} (${time})`);
      });
    }
    if (_branchCount > 1) {
      const branches = signalListBranches(state._signalGraph);
      lines.push('--- branches ---');
      branches.forEach((b) => {
        const marker = b.id === state._signalGraph?.cursorId ? '> ' : '  ';
        lines.push(`${marker}[${b.id}] ${b.type}: ${b.summary || ''}`);
      });
      ind.title = lines.join('\n');
      ind.style.cursor = 'pointer';
      ind.onclick = () => {
        const branches = signalListBranches(state._signalGraph);
        if (branches.length < 2) return;
        // Cycle to the next branch
        const currentIdx = branches.findIndex((b) => b.id === state._signalGraph?.cursorId);
        const nextIdx = (currentIdx + 1) % branches.length;
        switchToBranch(branches[nextIdx].id);
      };
    } else {
      ind.title = lines.join('\n');
      ind.style.cursor = 'default';
      ind.onclick = null;
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
      switchBranch(childNodeId) {
        switchToBranch(childNodeId);
        return getMeta();
      },
      getBranches() {
        return signalListBranches(state._signalGraph);
      },
    },
  };

  function getMeta() {
    return {
      index: _historyIdx,
      total: _historyTotal,
      branches: _branchCount,
      checkpoints: _checkpoints.slice(),
    };
  }

  return {
    historyController: { getMeta, push: () => {}, undo: () => {}, redo: () => {}, markCheckpoint },
    pushHistory,
    undoHistory,
    redoHistory,
    switchToBranch,
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
