import { HexGrid }    from '/strategies/js/modules/HexGrid.js';
import { Store }      from '/strategies/js/modules/Store.js';
import { Doc }        from '/strategies/js/modules/Doc.js';
import { Editor }     from '/strategies/js/modules/Editor.js';
import { Browser }    from '/strategies/js/modules/Browser.js';
import { LibManager } from '/strategies/js/modules/LibManager.js';
import { URLCodec }   from '/strategies/js/modules/URLCodec.js';
import { Notation }   from '/strategies/js/modules/Notation.js';
import { UI }         from '/strategies/js/modules/UI.js';
import { HTN }        from '/strategies/js/modules/HTN.js';
import { Layout }     from '/strategies/js/modules/Layout.js';

const App = {
  async init() {
    Store.load();
    App._initTheme();
    Browser.init(node => { Editor.loadNode(node || null); UI.showEditor(() => Editor._buildBoard()); });
    LibManager.init(App._toast);

    const hash = window.location.hash.slice(1);
    const boardNav = !hash.startsWith('b/') && hash !== 'd' && hash !== 'c' && hash;
    if (boardNav) {
      const decoded = URLCodec.decodeFull(boardNav);
      if (decoded) {
        Editor.grid   = decoded.grid;
        Editor.labels = decoded.labels.map(l => ({ ...l, mark: l.mark ?? l.letter ?? 'a' }));
        document.getElementById('input-size').value = decoded.grid.s;
        Editor.noteOpen = decoded.labels.length > 0;
      } else { Editor.loadNode(null); }
    } else { Editor.loadNode(null); }

    Editor.bindPointer();
    Editor.onBoardSync = App._updateNotationPanel;
    App._bindEvents();
    App._bindResizeHandles();
    App._initTooltips();
    App._initCompact();
    UI.init(() => Editor._buildBoard());

    await Store.fetchDefaults();
    await Store.fetchAllActive();
    Browser._renderNav();

    if (hash.startsWith('b/')) {
      const parts = hash.slice(2).split('/');
      const libId = parts[0] || Store.LOCAL;
      const secId = parts[1] || null;
      const validLib = Store.libs[libId] || Store.libs[Store.LOCAL];
      UI.showBrowser(() => {
        Browser.render(validLib ? libId : Store.LOCAL, true);
        if (secId) setTimeout(() => Browser.scrollToSection(secId), 150);
      });
    } else if (hash === 'd') {
      UI.showData(() => LibManager.render());
    } else if (hash === 'c') {
      UI.showConvert(() => {});
    } else {
      UI.showEditor(() => Editor._buildBoard());
    }
  },

  _updateNotationPanel(grid) {
    if (!grid || !Editor.notationOpen) return;
    document.getElementById('nf-bke').value   = Notation.gridToBKE(grid);
    document.getElementById('nf-htn').value   = Notation.gridToHTN(grid);
    document.getElementById('nf-axial').value = Notation.gridToAxial(grid);
  },

  _importSingle(grid) {
    if (!grid) { App._toast('parse error'); return; }
    Editor.grid    = grid; Editor.labels  = []; Editor.history = []; Editor.nodeId  = null;
    document.getElementById('input-size').value = grid.s;
    Editor._buildBoard(); Editor._syncFooter(); Editor._syncMode();
    UI.showEditor(() => {}); App._toast('loaded');
  },

  _importMulti(entries, fmt) {
    const libId  = (Browser.activeLibId && Store.isLocal(Browser.activeLibId)) ? Browser.activeLibId : Store.LOCAL;
    const docObj = Store.getDoc(libId);
    const tree   = docObj?.doc || [];
    let count    = 0;
    for (const text of entries) {
      const grid = Notation.gridFromFmt(text, fmt);
      if (!grid) continue;
      tree.push(Doc.pos(URLCodec.encode(grid), '', text.slice(0, 60), []));
      count++;
    }
    Store.saveDoc(libId, tree);
    App._toast(`imported ${count} position${count !== 1 ? 's' : ''}`);
    if (UI.activeView === 'browser') Browser.render(libId);
  },

  _save() {
    Editor.note  = document.getElementById('note-text').value;
    Editor.title = document.getElementById('title-text').value;
    const libId  = (Browser.activeLibId && Store.isLocal(Browser.activeLibId)) ? Browser.activeLibId : Store.LOCAL;
    const docObj = Store.getDoc(libId);
    const tree   = docObj?.doc || [];
    const board  = URLCodec.encode(Editor.grid);
    const labels = Editor.labels.map(l => [l.q, l.r, l.mark]);
    if (Editor.nodeId) {
      const found = Doc.find(tree, Editor.nodeId);
      if (found) {
        Object.assign(found[0], { board, title: Editor.title, note: Editor.note, labels, htn: found[0].htn || '' });
        Store.saveDoc(libId, tree); Editor._syncMode(); Editor._setDirty(false);
        if (UI.activeView === 'browser') Browser.render(libId);
        App._toast('updated'); return;
      }
    }
    const node    = Doc.pos(board, Editor.title, Editor.note, labels);
    Editor.nodeId = node.id;
    if (Browser.insertContext) {
      const { list, idx } = Browser.insertContext; list.splice(idx, 0, node); Browser.insertContext = null;
    } else { tree.push(node); }
    Store.saveDoc(libId, tree); Editor._syncMode(); Editor._setDirty(false);
    if (UI.activeView === 'browser') Browser.render(libId);
    App._toast('saved');
  },

  _bindEvents() {
    const si = document.getElementById('input-size');
    const applySize = () => {
      const s = parseInt(si.value, 10); if (s < 2 || s > 32) return;
      const prev  = Editor.grid;
      const next  = HexGrid.create(s);
      const max   = s - 1;
      const dist  = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (prev) {
        for (const c of prev.cells.values())
          if (c.state && dist(c.q, c.r) <= max) HexGrid.setState(next, c.q, c.r, c.state);
        Editor.labels = Editor.labels.filter(l => dist(l.q, l.r) <= max);
      }
      Editor.grid = next; Editor.history = [];
      Editor._buildBoard(); Editor._syncFooter(); Editor._syncMode();
    };
    document.getElementById('btn-apply-size').addEventListener('click', applySize);
    si.addEventListener('keydown', e => { if (e.key === 'Enter') applySize(); });
    document.getElementById('btn-size-dec').addEventListener('click', () => { si.value = Math.max(2, parseInt(si.value,10)-1); applySize(); });
    document.getElementById('btn-size-inc').addEventListener('click', () => { si.value = Math.min(32, parseInt(si.value,10)+1); applySize(); });

    document.getElementById('btn-undo').addEventListener('click',  () => Editor.undo());
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (!confirm('Clear the board?')) return;
      Editor.clear();
    });
    document.getElementById('btn-save').addEventListener('click',  () => App._save());

    document.getElementById('btn-copy-image').addEventListener('click', () => {
      const svg  = document.getElementById('board-svg');
      const xml  = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale  = 2;
        canvas.width  = (svg.width.baseVal.value  || img.naturalWidth)  * scale;
        canvas.height = (svg.height.baseVal.value || img.naturalHeight) * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
            .then(() => App._toast('image copied'))
            .catch(() => App._toast('not supported in this browser'));
        });
      };
      img.src = url;
    });

    document.getElementById('btn-copy-board').addEventListener('click', () => {
      const enc = URLCodec.encodeFull(Editor.grid, Editor.labels);
      navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${enc}`).then(() => App._toast('link copied'));
    });

    document.getElementById('note-toggle-btn').addEventListener('click', () => {
      Editor.noteOpen = !Editor.noteOpen; Editor._syncPanels(); Editor._buildBoard();
    });
    document.getElementById('note-text').addEventListener('input',  e => { Editor.note  = e.target.value; Editor._setDirty(true); });
    document.getElementById('title-text').addEventListener('input', e => { Editor.title = e.target.value; Editor._setDirty(true); });

    document.getElementById('notation-toggle-btn').addEventListener('click', () => {
      Editor.notationOpen = !Editor.notationOpen; Editor._syncPanels(); Editor._buildBoard();
    });

    document.getElementById('btn-rotate-ccw')?.addEventListener('click', () => Editor.rotate(-1));
    document.getElementById('btn-rotate-cw')?.addEventListener('click',  () => Editor.rotate(1));
    document.getElementById('btn-mirror')?.addEventListener('click',     () => Editor.mirror());

    document.getElementById('nf-load-bke')?.addEventListener('click',   () => App._importSingle(Notation.fromBKE(document.getElementById('nf-bke').value)));
    document.getElementById('nf-load-htn')?.addEventListener('click',   () => App._importSingle(Notation.fromHTN(document.getElementById('nf-htn').value)));
    document.getElementById('nf-load-axial')?.addEventListener('click', () => App._importSingle(Notation.fromAxial(document.getElementById('nf-axial').value)));

    document.getElementById('nf-copy-bke').addEventListener('click',   () => App._copy(document.getElementById('nf-bke').value));
    document.getElementById('nf-copy-htn').addEventListener('click',   () => App._copy(document.getElementById('nf-htn').value));
    document.getElementById('nf-copy-axial').addEventListener('click', () => App._copy(document.getElementById('nf-axial').value));

    const modes = { 'btn-mode-x':'x', 'btn-mode-o':'o', 'btn-mode-auto':'auto' };
    for (const [id, mode] of Object.entries(modes)) {
      document.getElementById(id).addEventListener('click', () => {
        Editor.placeMode = mode;
        for (const bid of Object.keys(modes)) document.getElementById(bid).classList.toggle('active', bid === id);
      });
    }

    document.getElementById('btn-label-mode').addEventListener('click', () => {
      Editor.labelMode = Editor.labelMode === 'letter' ? 'number' : 'letter';
      const btn = document.getElementById('btn-label-mode');
      btn.textContent = Editor.labelMode === 'letter' ? 'a' : '1';
      btn.classList.toggle('active', Editor.labelMode === 'number');
    });

    for (const id of ['tab-editor','tab-editor-b','tab-editor-d','tab-editor-c'])
      document.getElementById(id).addEventListener('click', () => UI.showEditor(() => Editor._buildBoard()));
    for (const id of ['tab-browser','tab-browser-b','tab-browser-d','tab-browser-c'])
      document.getElementById(id).addEventListener('click', () => UI.showBrowser(() => Browser.render(Browser.activeLibId || Store.LOCAL)));
    for (const id of ['tab-data','tab-data-b','tab-data-d','tab-data-c'])
      document.getElementById(id).addEventListener('click', () => UI.showData(() => LibManager.render()));
    for (const id of ['tab-convert','tab-convert-b','tab-convert-d','tab-convert-c'])
      document.getElementById(id).addEventListener('click', () => UI.showConvert(() => {}));

    document.getElementById('btn-lib-add').addEventListener('click', async () => {
      const name = document.getElementById('lib-add-name').value.trim();
      const url  = document.getElementById('lib-add-url').value.trim();
      if (!name || !url) { App._toast('name and URL required'); return; }
      const id = Store.addLibrary(name, url);
      document.getElementById('lib-add-name').value = document.getElementById('lib-add-url').value = '';
      App._toast('loading…');
      await Store.fetchLibrary(id); LibManager.render(); App._toast('library added');
    });
    document.getElementById('lib-add-url').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-lib-add').click(); });

    document.getElementById('btn-convert').addEventListener('click', () => {
      const fromFmt = document.getElementById('conv-from').value;
      const toFmt   = document.getElementById('conv-to').value;
      const batch   = document.getElementById('conv-batch').checked;
      const input   = document.getElementById('conv-input').value.trim();
      const entries = batch ? Notation.parseMulti(input) : [input];
      const results = Notation.convertBatch(entries, fromFmt, toFmt);
      document.getElementById('conv-output').value = batch ? JSON.stringify(results, null, 2) : (results[0] || '(parse error)');
    });
    document.getElementById('btn-conv-copy').addEventListener('click',        () => App._copy(document.getElementById('conv-output').value));
    document.getElementById('btn-conv-load').addEventListener('click',        () => { const fmt = document.getElementById('conv-to').value; App._importSingle(Notation.gridFromFmt(document.getElementById('conv-output').value.trim(), fmt)); });
    document.getElementById('btn-conv-from-editor').addEventListener('click', () => { const fmt = document.getElementById('conv-from').value; document.getElementById('conv-input').value = Notation.gridToFmt(Editor.grid, fmt); });

    document.getElementById('btn-search-clear')?.addEventListener('click', () => {
      const s = document.getElementById('browser-search'); if (s) { s.value = ''; Browser._applySearch(''); s.focus(); }
    });
    document.getElementById('browser-search')?.addEventListener('input', e => Browser._applySearch(e.target.value));

    document.getElementById('btn-collapse-all')?.addEventListener('click',  () => Browser.setAllCollapsed(true));
    document.getElementById('btn-expand-all')?.addEventListener('click',    () => Browser.setAllCollapsed(false));
    document.getElementById('btn-compact')?.addEventListener('click',       () => App._toggleCompact());
    document.getElementById('btn-back-to-top')?.addEventListener('click',   () => { document.getElementById('browser-main').scrollTo({ top: 0, behavior: 'smooth' }); });

    document.querySelectorAll('.btn-theme').forEach(b => b.addEventListener('click', () => App._cycleTheme()));

    document.getElementById('browser-main')?.addEventListener('scroll', e => {
      const btn = document.getElementById('btn-back-to-top');
      if (btn) btn.hidden = e.target.scrollTop < 300;
    });

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); App._save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); Editor.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (UI.activeView !== 'browser') UI.showBrowser(() => Browser.render(Browser.activeLibId || Store.LOCAL));
        setTimeout(() => { const s = document.getElementById('browser-search'); s?.focus(); s?.select(); }, 50);
      }
    });

    document.getElementById('htn-text')?.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey) && e.key==='Enter') App._loadHtn(); });
    document.getElementById('btn-htn-load')?.addEventListener('click', () => App._loadHtn());

    window.addEventListener('hashchange', () => {
      const h = window.location.hash.slice(1);
      if (!h || (!h.startsWith('b/') && h !== 'd' && h !== 'c')) {
        const d = URLCodec.decodeFull(h); if (!d) return;
        Editor.grid = d.grid; Editor.labels = d.labels; Editor.history = []; Editor.nodeId = null;
        document.getElementById('input-size').value = d.grid.s;
        Editor.noteOpen = d.labels.length > 0;
        Editor._syncPanels(); Editor._buildBoard(); Editor._syncFooter(); Editor._syncMode();
      }
    });
  },

  _bindResizeHandles() {
    App._makeResizable(document.getElementById('note-resize'), e => { Editor._applyPanelResize('note', window.innerWidth - e.clientX); });
    App._makeResizable(document.getElementById('notation-resize'), e => { Editor._applyPanelResize('notation', window.innerWidth - (Editor.noteOpen ? Layout.NOTE_W : 0) - e.clientX); });
    App._makeResizable(document.getElementById('sidebar-resize'), e => {
      const w = Math.max(120, Math.min(360, e.clientX));
      document.getElementById('lib-sidebar').style.width  = w + 'px';
      document.getElementById('browser-main').style.left  = w + 'px';
      document.getElementById('browser-toolbar')?.style && (document.getElementById('browser-toolbar').style.left = w + 'px');
      document.documentElement.style.setProperty('--lib-side-w', w + 'px');
    });
  },

  _makeResizable(handle, onMove) {
    if (!handle) return;
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const up = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', up);
    });
  },

  _initTooltips() {
    const tip = document.getElementById('tooltip');
    const show = target => {
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      const r   = target.getBoundingClientRect();
      const below = r.top < 80;
      tip.style.top  = below ? (r.bottom + 6) + 'px' : (r.top - tip.offsetHeight - 6) + 'px';
      tip.style.left = Math.max(4, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 4)) + 'px';
    };
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-tip]');
      if (t) show(t); else tip.hidden = true;
    });
    document.addEventListener('mouseout', e => {
      if (!e.relatedTarget?.closest('[data-tip]')) tip.hidden = true;
    });
  },

  _initTheme() {
    const saved = localStorage.getItem('hexstrat-theme') || 'system';
    App._applyTheme(saved);
  },

  _cycleTheme() {
    const current = localStorage.getItem('hexstrat-theme') || 'system';
    const next = { dark: 'light', light: 'system', system: 'dark' }[current] || 'dark';
    localStorage.setItem('hexstrat-theme', next);
    App._applyTheme(next);
  },

  _applyTheme(theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('light', !useDark);
    const icons = { dark: '☾', light: '☀', system: '◑' };
    document.querySelectorAll('.btn-theme').forEach(b => b.textContent = icons[theme] || '◑');
    if (UI.activeView === 'editor' && Editor.grid) Editor._buildBoard();
    else if (UI.activeView === 'browser' && Browser.activeLibId) Browser.render(Browser.activeLibId, true);
  },

  _initCompact() {
    const compact = localStorage.getItem('hexstrat-compact') === '1';
    document.getElementById('browser-main')?.classList.toggle('browser-compact', compact);
    document.getElementById('btn-compact')?.classList.toggle('active', compact);
  },

  _toggleCompact() {
    const main   = document.getElementById('browser-main');
    const active = main.classList.toggle('browser-compact');
    localStorage.setItem('hexstrat-compact', active ? '1' : '');
    document.getElementById('btn-compact').classList.toggle('active', active);
  },

  _loadHtn() {
    const src  = document.getElementById('htn-text').value.trim(); if (!src) { App._toast('paste HTN first'); return; }
    const turn = parseInt(document.getElementById('htn-turn').value, 10) || Infinity;
    try {
      const { metadata, turns } = HTN.parse(src);
      const v = HTN.validate(turns); if (!v.ok) { App._toast(`invalid turn ${v.turn}: ${v.reason}`); return; }
      const grid = HTN.buildGrid(turns, turn);
      Editor.grid = grid; Editor.history = []; Editor.labels = []; Editor.nodeId = null;
      Editor.note = metadata.name ? `Game: ${metadata.name}` : ''; Editor.title = metadata.name || '';
      Editor.noteOpen = Editor.note.length > 0;
      document.getElementById('input-size').value = grid.s;
      Editor._syncPanels(); Editor._syncFooter(); Editor._syncMode();
      UI.showEditor(() => Editor._buildBoard());
      App._toast('loaded from HTN');
    } catch (err) { App._toast('parse error: ' + err.message); }
  },

  _copy(text) {
    if (!text) { App._toast('nothing to copy'); return; }
    navigator.clipboard?.writeText(text).then(() => App._toast('copied'));
  },

  _toast(msg) {
    const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  },
};

export { App };