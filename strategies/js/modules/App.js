import { HexGrid }       from '/strategies/js/modules/HexGrid.js';
import { Store }         from '/strategies/js/modules/Store.js';
import { BoardRenderer } from '/strategies/js/modules/BoardRenderer.js';
import { URLCodec }      from '/strategies/js/modules/URLCodec.js';
import { Layout }        from '/strategies/js/modules/Layout.js';
import { UI }            from '/strategies/js/modules/UI.js';
import { HTN }           from '/strategies/js/modules/HTN.js';

const App = {
  grid:           null,
  labels:         [],
  note:           '',
  title:          '',
  history:        [],
  placeMode:      'auto',
  noteOpen:       false,
  activeLib:      null,
  activeTag:      null,
  currentLocalId: null,   // UUID of the local entry being edited; null = new/unsaved
  _ptrDrag:       null,

  async init() {
    Store.load();

    // Load board from URL hash if present (shared link)
    const hash    = window.location.hash.slice(1);
    const decoded = hash ? URLCodec.decodeFull(hash) : null;
    if (decoded) {
      App.grid   = decoded.grid;
      App.labels = decoded.labels;
      document.getElementById('input-size').value = decoded.grid.s;
    } else {
      App.grid = HexGrid.create(5);
    }

    App._syncFooter();
    App._syncEditorMode();
    App._syncNotePanel();
    App._bindEvents();
    UI.init(() => App._buildBoard());
    UI.showEditor(() => App._buildBoard());

    await Store.fetchDefaults();
    await Store.fetchAllActive();
    if (UI.activeView === 'browser') App._renderBrowser();
    if (UI.activeView === 'data')    App._renderLibManagement();
  },

  // Load a position entry into the editor
  _loadEntry(entry) {
    const grid = URLCodec.decode(entry.board || entry.key);
    if (!grid) return;
    App.grid           = grid;
    App.history        = [];
    App.labels         = entry.labels || [];
    App.note           = entry.note   || '';
    App.title          = entry.title  || '';
    App.currentLocalId = entry.sourceId === Store.LOCAL ? entry.key : null;
    document.getElementById('input-size').value = grid.s;
    App.noteOpen = App.note.trim().length > 0 || App.title.trim().length > 0;
    App._syncNotePanel();
    App._syncFooter();
    App._syncEditorMode();
    UI.showEditor(() => App._buildBoard());
  },

  // Save current editor state. Updates existing local entry or creates a new one.
  _saveEntry() {
    App.note  = document.getElementById('note-text').value;
    App.title = document.getElementById('title-text').value;
    const board    = URLCodec.encode(App.grid);
    const id       = App.currentLocalId || Store._uid();
    const existing = App.currentLocalId ? (Store.getLocal(App.currentLocalId) || {}) : {};
    App.currentLocalId = id;
    Store.setLocal(id, {
      board,
      title:  App.title,
      note:   App.note,
      labels: App.labels,
      tags:   existing.tags || [],
      htn:    existing.htn  || '',
    });
    App._syncEditorMode();
    App._toast('saved');
  },

  // Copy a shareable link with board and labels encoded into the URL hash
  _copyBoard() {
    const encoded = URLCodec.encodeFull(App.grid, App.labels);
    const url     = `${location.origin}${location.pathname}#${encoded}`;
    navigator.clipboard?.writeText(url)
      .then(() => App._toast('link copied'))
      .catch(() => App._toast('copy failed'));
  },

  _buildBoard() {
    BoardRenderer.build(
      document.getElementById('board-svg'),
      App.grid,
      App.labels,
      { w: Layout.boardW(App.noteOpen), h: Layout.boardH() }
    );
  },

  _syncFooter() {
    const { x, o, total } = HexGrid.countStones(App.grid);
    document.getElementById('footer-stones').textContent = `X: ${x}  O: ${o}  total: ${total}`;
    document.getElementById('footer-hash').textContent   = URLCodec.encode(App.grid) || '(empty)';
  },

  _syncEditorMode() {
    const el = document.getElementById('editor-mode');
    if (!el) return;
    el.textContent = App.currentLocalId ? 'editing' : 'new';
    const btn = document.getElementById('btn-save');
    if (btn) btn.textContent = App.currentLocalId ? '★ update' : '★ save';
  },

  _syncNotePanel() {
    const panel     = document.getElementById('note-panel');
    const boardArea = document.getElementById('board-area');
    const toggle    = document.getElementById('note-toggle-btn');
    document.getElementById('note-text').value  = App.note;
    document.getElementById('title-text').value = App.title;
    toggle.classList.toggle('active', App.noteOpen);
    if (App.noteOpen) {
      panel.style.display   = 'flex';
      boardArea.style.right = Layout.NOTE_PANEL_W + 'px';
    } else {
      panel.style.display   = 'none';
      boardArea.style.right = '0';
    }
  },

  _computeStoneAction(cell, ctrl) {
    if (ctrl) return 0;
    if (App.placeMode === 'x') return cell.state === 1 ? 0 : 1;
    if (App.placeMode === 'o') return cell.state === 2 ? 0 : 2;
    return (cell.state + 1) % 3;
  },

  _applyStone(q, r, targetState) {
    const cell = HexGrid.cell(App.grid, q, r);
    if (!cell || cell.state === targetState) return;
    App.history.push({ q, r, prevState: cell.state });
    HexGrid.setState(App.grid, q, r, targetState);
    BoardRenderer.updateCell(document.getElementById('board-svg'), q, r, targetState);
  },

  _nextLabel() {
    const counts = {};
    for (const l of App.labels) counts[l.letter] = (counts[l.letter] || 0) + 1;
    for (let i = 0; ; i++) {
      const base  = String.fromCharCode(97 + (i % 26));
      const round = Math.floor(i / 26);
      if ((counts[base] || 0) <= round) return base;
    }
  },

  _applyLabel(q, r, clear) {
    App.labels = App.labels.filter(l => !(l.q === q && l.r === r));
    if (!clear) App.labels.push({ q, r, letter: App._nextLabel() });
    App._buildBoard();
  },

  _renderBrowser() {
    App._renderLibNav();
    App._renderCards();
  },

  _renderLibNav() {
    const nav = document.getElementById('lib-nav');
    nav.innerHTML = '';

    const makeItem = (label, active, dim, onClick) => {
      const el = document.createElement('div');
      el.className = 'lib-nav-item' + (active ? ' active' : '') + (dim ? ' dim' : '');
      el.textContent = label;
      el.addEventListener('click', onClick);
      return el;
    };

    const makeSub = (label, active, onClick) => {
      const el = document.createElement('div');
      el.className = 'lib-nav-sub' + (active ? ' active' : '');
      el.textContent = label;
      el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
      return el;
    };

    nav.appendChild(makeItem('All', App.activeLib === null, false, () => {
      App.activeLib = null; App.activeTag = null; App._renderBrowser();
    }));

    const entries = [
      [Store.LOCAL, Store.libs[Store.LOCAL]],
      ...Object.entries(Store.libs).filter(([id]) => id !== Store.LOCAL),
    ];

    for (const [id, lib] of entries) {
      if (!lib) continue;
      const isActive = App.activeLib === id;
      nav.appendChild(makeItem(lib.name, isActive && App.activeTag === null, !lib.active, () => {
        App.activeLib = id; App.activeTag = null; App._renderBrowser();
      }));
      if (isActive) {
        for (const tag of Store.tagsOf(id)) {
          nav.appendChild(makeSub('#' + tag, App.activeTag === tag, () => {
            App.activeTag = tag; App._renderBrowser();
          }));
        }
      }
    }
  },

  _renderCards() {
    const grid = document.getElementById('cards-grid');
    grid.innerHTML = '';

    let positions = Store.positionsOf(App.activeLib);
    if (App.activeTag) positions = positions.filter(p => p.tags?.includes(App.activeTag));

    if (!positions.length) {
      const msg       = document.createElement('div');
      msg.className   = 'browser-empty';
      msg.textContent = 'No positions here yet.';
      grid.appendChild(msg);
      return;
    }

    for (const entry of positions) {
      const hexGrid = URLCodec.decode(entry.board || entry.key);
      if (!hexGrid) continue;
      grid.appendChild(App._makeCard(entry, hexGrid));
    }
  },

  _makeCard(entry, hexGrid) {
    const CARD_W  = 200, CARD_H = 160;
    const isLocal = entry.sourceId === Store.LOCAL;

    const card       = document.createElement('div');
    card.className   = 'pos-card';
    card.draggable   = isLocal;
    card.dataset.key = entry.key;

    if (isLocal) {
      const clearDrag = () => card.classList.remove('drag-before', 'drag-after', 'dragging');
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', entry.key);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => card.classList.add('dragging'), 0);
      });
      card.addEventListener('dragend',   clearDrag);
      card.addEventListener('dragleave', () => card.classList.remove('drag-before', 'drag-after'));
      card.addEventListener('dragover', e => {
        e.preventDefault();
        const before = e.clientX < card.getBoundingClientRect().left + card.offsetWidth / 2;
        card.classList.toggle('drag-before', before);
        card.classList.toggle('drag-after',  !before);
      });
      card.addEventListener('drop', e => {
        e.preventDefault();
        const from   = e.dataTransfer.getData('text/plain');
        const before = e.clientX < card.getBoundingClientRect().left + card.offsetWidth / 2;
        clearDrag();
        if (from !== entry.key) { Store.reorderLocal(from, entry.key, before); App._renderCards(); }
      });
    }

    const boardWrap     = document.createElement('div');
    boardWrap.className = 'card-board';
    const svg           = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    boardWrap.appendChild(svg);
    BoardRenderer.build(svg, hexGrid, entry.labels ?? [],
      { w: CARD_W, h: CARD_H, margin: 8, mini: true, hover: false });

    const meta     = document.createElement('div');
    meta.className = 'card-meta';

    if (entry.title) {
      const el       = document.createElement('div');
      el.className   = 'card-title';
      el.textContent = entry.title;
      meta.appendChild(el);
    }

    if (entry.sourceId && entry.sourceId !== Store.LOCAL) {
      const src       = document.createElement('div');
      src.className   = 'card-source';
      src.textContent = Store.libs[entry.sourceId]?.name || '';
      meta.appendChild(src);
    }

    if (entry.note) {
      const el       = document.createElement('div');
      el.className   = 'card-note';
      el.textContent = entry.note.split('\n')[0];
      meta.appendChild(el);
    }

    const { x, o } = HexGrid.countStones(hexGrid);
    const stats       = document.createElement('div');
    stats.className   = 'card-stats';
    stats.textContent = `X ${x}  O ${o}  s${hexGrid.s}`;
    meta.appendChild(stats);

    const chips     = document.createElement('div');
    chips.className = 'card-chips';
    App._renderChips(chips, entry);
    meta.appendChild(chips);

    if (isLocal) {
      const actions     = document.createElement('div');
      actions.className = 'card-actions';
      const del         = document.createElement('button');
      del.className     = 'btn card-delete-btn';
      del.textContent   = '✕ delete';
      del.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm(`Delete "${entry.title || entry.key}"?`)) return;
        if (App.currentLocalId === entry.key) {
          App.currentLocalId = null;
          App._syncEditorMode();
        }
        Store.deleteLocal(entry.key);
        App._renderCards();
        App._renderLibNav();
      });
      actions.appendChild(del);
      meta.appendChild(actions);
    }

    card.appendChild(boardWrap);
    card.appendChild(meta);

    // Click board area to open in editor
    boardWrap.addEventListener('click', () => App._loadEntry(entry));

    return card;
  },

  _renderChips(container, entry) {
    container.innerHTML = '';
    for (const tag of (entry.tags || [])) {
      const chip       = document.createElement('span');
      chip.className   = 'chip';
      chip.textContent = tag;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        App._togglePositionTag(entry, tag);
        App._renderCards();
        App._renderLibNav();
      });
      container.appendChild(chip);
    }
    const add       = document.createElement('span');
    add.className   = 'chip add-chip';
    add.textContent = '+ tag';
    add.addEventListener('click', e => { e.stopPropagation(); App._showTagPicker(e, entry); });
    container.appendChild(add);
  },

  _showTagPicker(e, entry) {
    document.querySelector('.tag-picker')?.remove();
    const existingTags = Store.tagsOf(App.activeLib);
    const picker       = document.createElement('div');
    picker.className   = 'tag-picker';

    // Position picker, keeping it within the viewport
    const vpH = window.innerHeight;
    picker.style.left = e.clientX + 'px';
    picker.style.top  = e.clientY + 'px';

    const input       = document.createElement('input');
    input.type        = 'text';
    input.placeholder = 'new tag…';
    input.className   = 'picker-input';
    input.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      const tag = input.value.trim();
      if (!tag) return;
      App._togglePositionTag(entry, tag);
      picker.remove();
      App._renderCards();
      App._renderLibNav();
    });
    picker.appendChild(input);

    for (const tag of existingTags) {
      const item      = document.createElement('div');
      item.className  = 'picker-item';
      const check       = document.createElement('span');
      check.className   = 'picker-check';
      check.textContent = (entry.tags || []).includes(tag) ? '✓' : '';
      const name       = document.createElement('span');
      name.textContent = tag;
      item.appendChild(check);
      item.appendChild(name);
      item.addEventListener('click', () => {
        App._togglePositionTag(entry, tag);
        picker.remove();
        App._renderCards();
        App._renderLibNav();
      });
      picker.appendChild(item);
    }

    document.body.appendChild(picker);

    // Flip picker above click point if it would overflow the viewport
    const rect = picker.getBoundingClientRect();
    if (rect.bottom > vpH - 8) picker.style.top = Math.max(8, e.clientY - rect.height) + 'px';

    setTimeout(() => input.focus(), 0);
    const close = ev => {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  _togglePositionTag(entry, tag) {
    // For remote entries, copy to local first so we can save tags
    const localId = entry.sourceId === Store.LOCAL ? entry.key : Store.copyToLocal(entry);
    const stored  = Store.getLocal(localId) || { board: entry.board || entry.key, title: '', note: '', labels: [], tags: [], htn: '' };
    const tags    = stored.tags.includes(tag)
      ? stored.tags.filter(t => t !== tag)
      : [...stored.tags, tag];
    Store.setLocal(localId, { ...stored, tags });
  },

  _renderLibManagement() {
    const list = document.getElementById('lib-mgmt-list');
    list.innerHTML = '';

    const entries = [
      [Store.LOCAL, Store.libs[Store.LOCAL]],
      ...Object.entries(Store.libs).filter(([id]) => id !== Store.LOCAL),
    ];

    for (const [id, lib] of entries) {
      if (!lib) continue;
      const row       = document.createElement('div');
      row.className   = 'lib-mgmt-row';
      const isLocal   = id === Store.LOCAL;

      if (!isLocal) {
        const toggle       = document.createElement('button');
        toggle.className   = 'lib-toggle-btn' + (lib.active ? ' active' : '');
        toggle.textContent = lib.active ? '●' : '○';
        toggle.title       = lib.active ? 'Disable' : 'Enable';
        toggle.addEventListener('click', () => { Store.toggleLibrary(id); App._renderLibManagement(); App._renderLibNav(); });
        row.appendChild(toggle);
      }

      const nameEl           = document.createElement('div');
      nameEl.className       = 'lib-mgmt-name';
      nameEl.textContent     = lib.name;
      nameEl.contentEditable = !isLocal;
      if (!isLocal) {
        nameEl.addEventListener('blur',    () => Store.renameLibrary(id, nameEl.textContent.trim() || lib.name));
        nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });
      }
      row.appendChild(nameEl);

      if (!isLocal && lib.url) {
        const urlEl       = document.createElement('div');
        urlEl.className   = 'lib-mgmt-url';
        urlEl.textContent = lib.url;
        urlEl.title       = lib.url;
        row.appendChild(urlEl);
      }

      const count       = isLocal ? Object.keys(Store.local).length : Object.keys(Store.cache[id] || {}).length;
      const countEl     = document.createElement('span');
      countEl.className = 'lib-mgmt-count';
      countEl.textContent = count + ' pos';
      row.appendChild(countEl);

      const actions     = document.createElement('div');
      actions.className = 'lib-mgmt-actions';

      if (isLocal) {
        const expBtn       = document.createElement('button');
        expBtn.className   = 'btn';
        expBtn.textContent = '⬇ export';
        expBtn.addEventListener('click', () => {
          const blob = new Blob([Store.exportLocalJson()], { type: 'application/json' });
          const a    = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob), download: 'hex-strategy-local.json',
          });
          a.click();
          URL.revokeObjectURL(a.href);
        });
        const cpBtn       = document.createElement('button');
        cpBtn.className   = 'btn';
        cpBtn.textContent = '⎘ copy';
        cpBtn.addEventListener('click', () => {
          navigator.clipboard?.writeText(Store.exportLocalJson()).then(() => App._toast('copied'));
        });
        actions.appendChild(expBtn);
        actions.appendChild(cpBtn);
      } else {
        const refBtn       = document.createElement('button');
        refBtn.className   = 'btn';
        refBtn.textContent = '↺ reload';
        refBtn.addEventListener('click', async () => {
          await Store.fetchLibrary(id);
          App._renderLibManagement();
          if (UI.activeView === 'browser') App._renderBrowser();
          App._toast('reloaded');
        });
        const delBtn       = document.createElement('button');
        delBtn.className   = 'btn';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
          if (!confirm(`Remove library "${lib.name}"?`)) return;
          Store.removeLibrary(id);
          if (App.activeLib === id) App.activeLib = null;
          App._renderLibManagement();
          if (UI.activeView === 'browser') App._renderBrowser();
        });
        actions.appendChild(refBtn);
        actions.appendChild(delBtn);
      }

      row.appendChild(actions);
      list.appendChild(row);
    }
  },

  _loadHtn() {
    const src  = document.getElementById('htn-text').value.trim();
    const turn = parseInt(document.getElementById('htn-turn').value, 10) || Infinity;
    if (!src) { App._toast('paste HTN first'); return; }
    try {
      const { metadata, turns } = HTN.parse(src);
      const validation          = HTN.validate(turns);
      if (!validation.ok) { App._toast(`invalid turn ${validation.turn}: ${validation.reason}`); return; }
      const grid         = HTN.buildGrid(turns, turn);
      App.grid           = grid;
      App.history        = [];
      App.labels         = [];
      App.note           = metadata.name ? `Game: ${metadata.name}` : '';
      App.title          = metadata.name || '';
      App.currentLocalId = null;
      App.noteOpen       = App.note.length > 0;
      document.getElementById('input-size').value = grid.s;
      App._syncNotePanel();
      App._syncFooter();
      App._syncEditorMode();
      UI.showEditor(() => App._buildBoard());
      App._toast('loaded from HTN');
    } catch (err) {
      App._toast('parse error: ' + err.message);
    }
  },

  _bindEvents() {
    // Board size: apply, + and -
    const sizeInput = document.getElementById('input-size');
    const applySize = () => {
      const s = parseInt(sizeInput.value, 10);
      if (s >= 2 && s <= 32) {
        App.grid           = HexGrid.create(s);
        App.history        = [];
        App.labels         = [];
        App.note           = '';
        App.title          = '';
        App.currentLocalId = null;
        document.getElementById('note-text').value  = '';
        document.getElementById('title-text').value = '';
        App._syncNotePanel();
        App._buildBoard();
        App._syncFooter();
        App._syncEditorMode();
      }
    };
    document.getElementById('btn-apply-size').addEventListener('click', applySize);
    sizeInput.addEventListener('keydown', e => { if (e.key === 'Enter') applySize(); });
    document.getElementById('btn-size-dec').addEventListener('click', () => {
      sizeInput.value = Math.max(2,  parseInt(sizeInput.value, 10) - 1); applySize();
    });
    document.getElementById('btn-size-inc').addEventListener('click', () => {
      sizeInput.value = Math.min(32, parseInt(sizeInput.value, 10) + 1); applySize();
    });

    document.getElementById('btn-undo').addEventListener('click', () => {
      const last = App.history.pop();
      if (!last) return;
      HexGrid.setState(App.grid, last.q, last.r, last.prevState);
      BoardRenderer.updateCell(document.getElementById('board-svg'), last.q, last.r, last.prevState);
      App._syncFooter();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      for (const cell of App.grid.cells.values()) cell.state = 0;
      App.history        = [];
      App.labels         = [];
      App.currentLocalId = null;
      App._buildBoard();
      App._syncFooter();
      App._syncEditorMode();
    });

    document.getElementById('btn-save').addEventListener('click',       () => App._saveEntry());
    document.getElementById('btn-copy-board').addEventListener('click', () => App._copyBoard());

    document.getElementById('note-toggle-btn').addEventListener('click', () => {
      App.noteOpen = !App.noteOpen;
      App._syncNotePanel();
      App._buildBoard();
    });

    document.getElementById('note-text').addEventListener('input',  e => { App.note  = e.target.value; });
    document.getElementById('title-text').addEventListener('input', e => { App.title = e.target.value; });

    const modeMap = { 'btn-mode-x': 'x', 'btn-mode-o': 'o', 'btn-mode-auto': 'auto' };
    for (const [id, mode] of Object.entries(modeMap)) {
      document.getElementById(id).addEventListener('click', () => {
        App.placeMode = mode;
        for (const bid of Object.keys(modeMap))
          document.getElementById(bid).classList.toggle('active', bid === id);
      });
    }

    const showEditor  = () => UI.showEditor(() => App._buildBoard());
    const showBrowser = () => UI.showBrowser(() => App._renderBrowser());
    const showData    = () => UI.showData(() => App._renderLibManagement());
    for (const id of ['tab-editor','tab-editor-b','tab-editor-d'])   document.getElementById(id).addEventListener('click', showEditor);
    for (const id of ['tab-browser','tab-browser-b','tab-browser-d']) document.getElementById(id).addEventListener('click', showBrowser);
    for (const id of ['tab-data','tab-data-b','tab-data-d'])          document.getElementById(id).addEventListener('click', showData);

    document.getElementById('btn-lib-add').addEventListener('click', async () => {
      const name = document.getElementById('lib-add-name').value.trim();
      const url  = document.getElementById('lib-add-url').value.trim();
      if (!name || !url) { App._toast('name and URL required'); return; }
      const id = Store.addLibrary(name, url);
      document.getElementById('lib-add-name').value = '';
      document.getElementById('lib-add-url').value  = '';
      App._renderLibManagement();
      App._toast('loading…');
      await Store.fetchLibrary(id);
      App._renderLibManagement();
      if (UI.activeView === 'browser') App._renderBrowser();
      App._toast('library added');
    });
    document.getElementById('lib-add-url').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-lib-add').click();
    });

    document.getElementById('btn-htn-load').addEventListener('click', () => App._loadHtn());
    document.getElementById('htn-text').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') App._loadHtn();
    });

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        document.getElementById('btn-undo').click();
      }
    });

    // Support loading shared links via URL hash
    window.addEventListener('hashchange', () => {
      const hash    = window.location.hash.slice(1);
      const decoded = URLCodec.decodeFull(hash);
      if (!decoded) return;
      App.grid           = decoded.grid;
      App.labels         = decoded.labels;
      App.history        = [];
      App.currentLocalId = null;
      document.getElementById('input-size').value = decoded.grid.s;
      App.noteOpen = decoded.labels.length > 0;
      App._syncNotePanel();
      App._buildBoard();
      App._syncFooter();
      App._syncEditorMode();
    });

    App._bindBoardPointer();
  },

  _bindBoardPointer() {
    const area   = document.getElementById('board-area');
    const cellAt = (x, y) => {
      const g = document.elementFromPoint(x, y)?.closest?.('[data-q]');
      return g ? { q: +g.dataset.q, r: +g.dataset.r } : null;
    };

    area.addEventListener('contextmenu', e => e.preventDefault());

    area.addEventListener('pointerdown', e => {
      if (e.target.closest('#note-panel')) return;
      e.preventDefault();
      const pos = cellAt(e.clientX, e.clientY);
      if (!pos) return;
      area.setPointerCapture(e.pointerId);
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.button === 0) {
        const action = App._computeStoneAction(HexGrid.cell(App.grid, pos.q, pos.r), ctrl);
        App._ptrDrag = { type: 'stone', action, visited: new Set() };
        App._applyStone(pos.q, pos.r, action);
        App._ptrDrag.visited.add(HexGrid.key(pos.q, pos.r));
      } else if (e.button === 2) {
        App._ptrDrag = { type: 'label', ctrl, visited: new Set() };
        App._applyLabel(pos.q, pos.r, ctrl);
        App._ptrDrag.visited.add(HexGrid.key(pos.q, pos.r));
      }
    });

    area.addEventListener('pointermove', e => {
      const drag = App._ptrDrag;
      if (!drag) return;
      const pos = cellAt(e.clientX, e.clientY);
      if (!pos) return;
      const key = HexGrid.key(pos.q, pos.r);
      if (drag.visited.has(key)) return;
      drag.visited.add(key);
      if (drag.type === 'stone') App._applyStone(pos.q, pos.r, drag.action);
      else                       App._applyLabel(pos.q, pos.r, drag.ctrl);
    });

    area.addEventListener('pointerup',     () => { App._ptrDrag = null; App._syncFooter(); });
    area.addEventListener('pointercancel', () => { App._ptrDrag = null; });
  },

  _toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  },
};

export { App };