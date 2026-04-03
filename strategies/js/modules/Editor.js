import { HexGrid }       from '/strategies/js/modules/HexGrid.js';
import { BoardRenderer } from '/strategies/js/modules/BoardRenderer.js';
import { URLCodec }      from '/strategies/js/modules/URLCodec.js';
import { Layout }        from '/strategies/js/modules/Layout.js';

const Editor = {
  grid:          null,
  labels:        [],
  note:          '',
  title:         '',
  history:       [],
  placeMode:     'auto',
  labelMode:     'letter',
  noteOpen:      false,
  notationOpen:  false,
  nodeId:        null,
  dirty:         false,
  _drag:         null,
  onBoardSync:   null,

  loadNode(node) {
    const grid = node ? URLCodec.decode(node.board) : null;
    Editor.grid    = grid || HexGrid.create(parseInt(document.getElementById('input-size').value, 10) || 5);
    Editor.labels  = (node?.labels || []).map(l => Array.isArray(l) ? { q: l[0], r: l[1], mark: l[2] } : { ...l, mark: l.mark ?? l.letter ?? 'a' });
    Editor.note    = node?.note  || '';
    Editor.title   = node?.title || '';
    Editor.nodeId  = node?.id    || null;
    Editor.history = [];
    if (grid) document.getElementById('input-size').value = grid.s;
    Editor.noteOpen = Editor.note.trim().length > 0 || Editor.title.trim().length > 0;
    Editor._setDirty(false);
    Editor._syncPanels();
    Editor._syncFooter();
    Editor._syncMode();
  },

  _setDirty(v) {
    Editor.dirty = v;
    document.getElementById('btn-save')?.classList.toggle('dirty', v);
  },

  undo() {
    const last = Editor.history.pop(); if (!last) return;
    HexGrid.setState(Editor.grid, last.q, last.r, last.prev);
    BoardRenderer.updateCell(document.getElementById('board-svg'), last.q, last.r, last.prev);
    Editor._syncFooter();
    Editor._setDirty(true);
  },

  clear() {
    for (const c of Editor.grid.cells.values()) c.state = 0;
    Editor.history = []; Editor.labels = []; Editor.nodeId = null;
    Editor._buildBoard(); Editor._syncFooter(); Editor._syncMode();
    Editor._setDirty(false);
  },

  _buildBoard() {
    BoardRenderer.build(document.getElementById('board-svg'), Editor.grid, Editor.labels,
      { w: Layout.boardW(Editor.noteOpen, Editor.notationOpen), h: Layout.boardH() });
  },

  _syncFooter() {
    const { x, o, total } = HexGrid.countStones(Editor.grid);
    document.getElementById('footer-stones').textContent = `X: ${x}  O: ${o}  total: ${total}`;
    document.getElementById('footer-hash').textContent   = URLCodec.encode(Editor.grid) || '(empty)';
    Editor.onBoardSync?.(Editor.grid);
  },

  _syncMode() {
    const el  = document.getElementById('editor-mode'); if (el) el.textContent = Editor.nodeId ? 'saved' : 'new';
    const btn = document.getElementById('btn-save');    if (btn) btn.textContent = Editor.nodeId ? '★ update' : '★ save';
    Editor._setDirty(Editor.dirty);
  },

  _syncPanels() {
    const noteW     = Editor.noteOpen     ? Layout.NOTE_W     : 0;
    const notationW = Editor.notationOpen ? Layout.NOTATION_W : 0;

    const notePanel = document.getElementById('note-panel');
    if (notePanel) { notePanel.style.display = Editor.noteOpen ? 'flex' : 'none'; notePanel.style.width = noteW + 'px'; }
    const nt = document.getElementById('note-text');    if (nt) nt.value = Editor.note;
    const tt = document.getElementById('title-text');   if (tt) tt.value = Editor.title;

    const notationPanel = document.getElementById('notation-panel');
    if (notationPanel) { notationPanel.style.display = Editor.notationOpen ? 'flex' : 'none'; notationPanel.style.right = noteW + 'px'; notationPanel.style.width = notationW + 'px'; }

    const ba = document.getElementById('board-area');
    if (ba) ba.style.right = (noteW + notationW) + 'px';

    document.getElementById('note-toggle-btn')?.classList.toggle('active', Editor.noteOpen);
    const toggles = document.getElementById('panel-toggles');
    if (toggles) toggles.style.right = (noteW + notationW) + 'px';
    document.getElementById('notation-toggle-btn')?.classList.toggle('active', Editor.notationOpen);

    if (Editor.notationOpen) Editor.onBoardSync?.(Editor.grid);
  },

  _applyPanelResize(which, newW) {
    const clamped = Math.max(180, Math.min(520, newW));
    if (which === 'note')     Layout.NOTE_W     = clamped;
    if (which === 'notation') Layout.NOTATION_W = clamped;
    Editor._syncPanels();
    Editor._buildBoard();
  },

  _computeAction(cell, ctrl) {
    if (ctrl) return 0;
    if (Editor.placeMode === 'x') return cell.state === 1 ? 0 : 1;
    if (Editor.placeMode === 'o') return cell.state === 2 ? 0 : 2;
    return (cell.state + 1) % 3;
  },

  _applyStone(q, r, state) {
    const cell = HexGrid.cell(Editor.grid, q, r); if (!cell || cell.state === state) return;
    Editor.history.push({ q, r, prev: cell.state });
    HexGrid.setState(Editor.grid, q, r, state);
    BoardRenderer.updateCell(document.getElementById('board-svg'), q, r, state);
    Editor._setDirty(true);
  },

  _nextMark() {
    if (Editor.labelMode === 'number') {
      const used = new Set(Editor.labels.map(l => Number(l.mark)).filter(n => !isNaN(n)));
      for (let i = 1; ; i++) if (!used.has(i)) return String(i);
    }
    const counts = {};
    for (const l of Editor.labels) counts[l.mark] = (counts[l.mark] || 0) + 1;
    for (let i = 0; ; i++) {
      const base = String.fromCharCode(97 + (i % 26)), round = Math.floor(i / 26);
      if ((counts[base] || 0) <= round) return base;
    }
  },

  _applyLabel(q, r, clear) {
    Editor.labels = Editor.labels.filter(l => !(l.q === q && l.r === r));
    if (!clear) Editor.labels.push({ q, r, mark: Editor._nextMark() });
    Editor._buildBoard();
    Editor._setDirty(true);
  },

  rotate(dir) {
    const fn = dir > 0
      ? (q, r) => ({ q: -r,   r: q + r })
      : (q, r) => ({ q: q + r, r: -q  });
    Editor._transformBoard(fn);
  },

  mirror() {
    Editor._transformBoard((q, r) => ({ q: -q - r, r }));
  },

  _transformBoard(fn) {
    const stones = [], labels = [];
    for (const c of Editor.grid.cells.values())
      if (c.state) stones.push({ ...fn(c.q, c.r), state: c.state });
    for (const l of Editor.labels)
      labels.push({ ...fn(l.q, l.r), mark: l.mark });
    for (const c of Editor.grid.cells.values()) c.state = 0;
    for (const s of stones) HexGrid.setState(Editor.grid, s.q, s.r, s.state);
    Editor.labels = labels;
    Editor.history = [];
    Editor._buildBoard(); Editor._syncFooter(); Editor._setDirty(true);
  },

  bindPointer() {
    const area   = document.getElementById('board-area');
    const cellAt = (x, y) => { const g = document.elementFromPoint(x,y)?.closest?.('[data-q]'); return g ? { q:+g.dataset.q, r:+g.dataset.r } : null; };

    area.addEventListener('contextmenu', e => e.preventDefault());
    area.addEventListener('pointerdown', e => {
      if (e.target.closest('#note-panel') || e.target.closest('#notation-panel')) return;
      e.preventDefault();
      const pos = cellAt(e.clientX, e.clientY); if (!pos) return;
      area.setPointerCapture(e.pointerId);
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.button === 0) {
        const action = Editor._computeAction(HexGrid.cell(Editor.grid, pos.q, pos.r), ctrl);
        Editor._drag = { type: 'stone', action, visited: new Set() };
        Editor._applyStone(pos.q, pos.r, action);
        Editor._drag.visited.add(HexGrid.key(pos.q, pos.r));
      } else if (e.button === 2) {
        Editor._drag = { type: 'label', ctrl, visited: new Set() };
        Editor._applyLabel(pos.q, pos.r, ctrl);
        Editor._drag.visited.add(HexGrid.key(pos.q, pos.r));
      }
    });
    area.addEventListener('pointermove', e => {
      const d = Editor._drag; if (!d) return;
      const pos = cellAt(e.clientX, e.clientY); if (!pos) return;
      const key = HexGrid.key(pos.q, pos.r); if (d.visited.has(key)) return;
      d.visited.add(key);
      if (d.type === 'stone') Editor._applyStone(pos.q, pos.r, d.action);
      else Editor._applyLabel(pos.q, pos.r, d.ctrl);
    });
    area.addEventListener('pointerup',     () => { Editor._drag = null; Editor._syncFooter(); });
    area.addEventListener('pointercancel', () => { Editor._drag = null; });
  },
};

export { Editor };