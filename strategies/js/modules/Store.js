import { Doc } from '/strategies/js/modules/Doc.js';

const Store = {
  LOCAL:       'local',
  DEFAULT_URL: 'https://hex-tic-tac-toe.github.io/strategies/data/default.json',
  _K:          { libs: 'hexstrat-libs', docs: 'hexstrat-docs' },

  libs:  {},
  docs:  {},
  cache: {},

  load() {
    const get = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
    this.libs = get(this._K.libs);
    this.docs = get(this._K.docs);
    if (!this.libs[this.LOCAL]) { this.libs[this.LOCAL] = { name: 'My Positions', active: true, local: true }; this._saveLibs(); }
    if (!this.docs[this.LOCAL]) { this.docs[this.LOCAL] = { version: 1, doc: [] }; this._saveDocs(); }
    this._migrate();
  },

  _migrate() {
    const raw = localStorage.getItem('hexstrat-local');
    if (!raw) return;
    try {
      const entries = JSON.parse(raw);
      const order   = JSON.parse(localStorage.getItem('hexstrat-order') || '[]');
      const keys    = [...new Set([...order, ...Object.keys(entries)])];
      for (const k of keys) {
        const e = entries[k]; if (!e?.board) continue;
        const labels = (e.l || []).map(l => Array.isArray(l) ? l : [l.q, l.r, l.letter || l.mark || 'a']);
        this.docs[this.LOCAL].doc.push(Doc.pos(e.board, e.t || '', e.n || '', labels, e.h || ''));
      }
      this._saveDocs();
    } catch {}
    localStorage.removeItem('hexstrat-local');
    localStorage.removeItem('hexstrat-order');
  },

  async fetchDefaults() {
    try {
      const data = await (await fetch(this.DEFAULT_URL)).json();
      let changed = false;
      for (const lib of (data.libraries || [])) {
        if (!lib.url || !lib.name) continue;
        if (!Object.values(this.libs).some(l => l.url === lib.url)) { this.addLibrary(lib.name, lib.url, false); changed = true; }
      }
      if (changed) this._saveLibs();
    } catch {}
  },

  async fetchLibrary(id) {
    const lib = this.libs[id]; if (!lib?.url) return;
    try {
      const data = await (await fetch(lib.url)).json();
      this.cache[id] = data.version === 1 && Array.isArray(data.doc)
        ? data
        : { version: 1, doc: Doc.fromV0(data.positions || {}) };
    } catch {}
  },

  async fetchAllActive() {
    await Promise.all(Object.entries(this.libs).filter(([, l]) => l.active && l.url).map(([id]) => this.fetchLibrary(id)));
  },

  addLibrary(name, url, persist = true) {
    const id = 'lib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    this.libs[id] = { name, url, active: true };
    if (persist) this._saveLibs();
    return id;
  },

  openAsWorkspace(libId) {
    const src = this.cache[libId]; if (!src) return null;
    const id  = 'ws_' + Date.now().toString(36);
    this.libs[id] = { name: `${this.libs[libId]?.name || 'Remote'} (workspace)`, active: true, local: true };
    this.docs[id] = JSON.parse(JSON.stringify(src));
    this._saveLibs(); this._saveDocs();
    return id;
  },

  removeLibrary(id) {
    if (id === this.LOCAL) return;
    delete this.libs[id]; delete this.cache[id];
    if (this.docs[id]) { delete this.docs[id]; this._saveDocs(); }
    this._saveLibs();
  },

  renameLibrary(id, name) { if (this.libs[id]) { this.libs[id].name = name; this._saveLibs(); } },
  toggleLibrary(id)       { if (this.libs[id]) { this.libs[id].active = !this.libs[id].active; this._saveLibs(); } },
  isLocal(id)             { return !!this.libs[id]?.local; },

  getDoc(id)         { return (this.isLocal(id) ? this.docs : this.cache)[id] || null; },
  saveDoc(id, tree)  { if (!this.isLocal(id)) return; if (!this.docs[id]) this.docs[id] = { version: 1, doc: [] }; this.docs[id].doc = tree; this._saveDocs(); },

  exportDoc(id) {
    const d = this.getDoc(id); if (!d) return '{}';
    return JSON.stringify({ version: 1, doc: d.doc }, null, 2);
  },

  resetDoc(id) { if (!this.isLocal(id)) return; this.docs[id] = { version: 1, doc: [] }; this._saveDocs(); },

  _saveLibs() { localStorage.setItem(this._K.libs, JSON.stringify(this.libs)); },
  _saveDocs()  { localStorage.setItem(this._K.docs, JSON.stringify(this.docs)); },
};

export { Store };