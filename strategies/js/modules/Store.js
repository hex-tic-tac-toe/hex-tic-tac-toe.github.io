// Local positions use random UUID keys and store the board encoding in a 'board' field.
// This decouples the storage key from the board state, so editing a position's board
// doesn't create a duplicate — the entry is updated in place.
//
// Remote library positions keep the original format (board encoding as key).

const Store = {
  LOCAL:       'local',
  LIBS_KEY:    'hexstrat-libs',
  LOCAL_KEY:   'hexstrat-local',
  ORDER_KEY:   'hexstrat-order',
  DEFAULT_URL: 'https://hex-tic-tac-toe.github.io/strategies/data/default.json',

  libs:  {},
  local: {},
  order: [],
  cache: {},

  _uid: () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),

  load() {
    try { this.libs  = JSON.parse(localStorage.getItem(this.LIBS_KEY)  || '{}'); } catch { this.libs  = {}; }
    try { this.local = JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '{}'); } catch { this.local = {}; }
    try { this.order = JSON.parse(localStorage.getItem(this.ORDER_KEY) || '[]'); } catch { this.order = []; }
    if (!this.libs[this.LOCAL]) {
      this.libs[this.LOCAL] = { name: 'My Positions', active: true };
      this._saveLibs();
    }
    this._migrateOldDb();
    this._migrateToUuidKeys();
  },

  // Migrate legacy hexstrat-db format to new separate stores
  _migrateOldDb() {
    const raw = localStorage.getItem('hexstrat-db');
    if (!raw) return;
    try {
      const old    = JSON.parse(raw);
      const tagMap = old['_t'] || {};
      let   dirty  = false;
      for (const [key, val] of Object.entries(old)) {
        if (key.startsWith('_') || typeof val !== 'object' || !val) continue;
        if (Object.values(this.local).some(l => l.board === key)) continue;
        const tags   = (val.g || val.tags || []).map(t => tagMap[t] || t).filter(Boolean);
        const labels = (val.l || val.labels || []).map(l => Array.isArray(l) ? l : [l.q, l.r, l.letter]);
        const c      = { board: key };
        const t = val.t || val.title; if (t) c.t = t;
        const n = val.n || val.note;  if (n) c.n = n;
        if (labels.length) c.l = labels;
        if (tags.length)   c.g = tags;
        const h = val.h || val.htn;   if (h) c.h = h;
        this.local[this._uid()] = c;
        dirty = true;
      }
      if (dirty) this._saveLocal();
      localStorage.removeItem('hexstrat-db');
    } catch {}
  },

  // Migrate old local format where key = board encoding (no board field)
  _migrateToUuidKeys() {
    if (!Object.values(this.local).some(v => !v.board)) return;
    const newLocal = {}, newOrder = [];
    const ordered  = [...new Set([...this.order, ...Object.keys(this.local)])];
    for (const key of ordered) {
      const val = this.local[key];
      if (!val) continue;
      if (val.board) { newLocal[key] = val; newOrder.push(key); }
      else { const id = this._uid(); newLocal[id] = { board: key, ...val }; newOrder.push(id); }
    }
    this.local = newLocal;
    this.order = newOrder;
    this._saveLocal();
    this._saveOrder();
  },

  async fetchDefaults() {
    try {
      const res  = await fetch(this.DEFAULT_URL);
      if (!res.ok) return;
      const data = await res.json();
      let   changed = false;
      for (const lib of (data.libraries || [])) {
        if (!lib.url || !lib.name) continue;
        if (!Object.values(this.libs).some(l => l.url === lib.url)) {
          this.addLibrary(lib.name, lib.url, false);
          changed = true;
        }
      }
      if (changed) this._saveLibs();
    } catch {}
  },

  async fetchLibrary(id) {
    const lib = this.libs[id];
    if (!lib?.url) return;
    try {
      const res  = await fetch(lib.url);
      if (!res.ok) return;
      const data = await res.json();
      this.cache[id] = data.positions || {};
    } catch {}
  },

  async fetchAllActive() {
    await Promise.all(
      Object.entries(this.libs)
        .filter(([id, l]) => l.active && l.url)
        .map(([id]) => this.fetchLibrary(id))
    );
  },

  addLibrary(name, url, persist = true) {
    const id = 'lib_' + Date.now().toString(36);
    this.libs[id] = { name, url, active: true };
    if (persist) this._saveLibs();
    return id;
  },

  removeLibrary(id) {
    if (id === this.LOCAL) return;
    delete this.libs[id];
    delete this.cache[id];
    this._saveLibs();
  },

  renameLibrary(id, name) {
    if (this.libs[id]) { this.libs[id].name = name; this._saveLibs(); }
  },

  toggleLibrary(id) {
    if (id === this.LOCAL) return;
    if (this.libs[id]) { this.libs[id].active = !this.libs[id].active; this._saveLibs(); }
  },

  _norm(raw) {
    return {
      board:  raw.board  || '',
      title:  raw.t || raw.title  || '',
      note:   raw.n || raw.note   || '',
      labels: (raw.l || raw.labels || []).map(l => Array.isArray(l) ? { q: l[0], r: l[1], letter: l[2] } : l),
      tags:   raw.g || raw.tags   || [],
      htn:    raw.h || raw.htn    || '',
    };
  },

  _compact({ board = '', title = '', note = '', labels = [], tags = [], htn = '' }) {
    const c = {};
    if (board)         c.board = board;
    if (title)         c.t = title;
    if (note)          c.n = note;
    if (labels.length) c.l = labels.map(l => [l.q, l.r, l.letter]);
    if (tags.length)   c.g = tags;
    if (htn)           c.h = htn;
    return c;
  },

  getLocal(id)        { return this.local[id] ? this._norm(this.local[id]) : null; },

  setLocal(id, entry) {
    this.local[id] = this._compact(entry);
    if (!this.order.includes(id)) { this.order.unshift(id); this._saveOrder(); }
    this._saveLocal();
  },

  deleteLocal(id) {
    delete this.local[id];
    this.order = this.order.filter(k => k !== id);
    this._saveLocal();
    this._saveOrder();
  },

  // Find a local entry by its board encoding (returns null if not found)
  findLocalByBoard(boardEnc) {
    for (const [id, val] of Object.entries(this.local))
      if (val.board === boardEnc) return { key: id, ...this._norm(val) };
    return null;
  },

  // Copy a remote entry to local; returns the local UUID (or existing one if already copied)
  copyToLocal(entry) {
    const boardEnc = entry.board || entry.key;
    const existing = this.findLocalByBoard(boardEnc);
    if (existing) return existing.key;
    const id = this._uid();
    this.setLocal(id, {
      board:  boardEnc,
      title:  entry.title  || '',
      note:   entry.note   || '',
      labels: entry.labels || [],
      tags:   entry.tags   || [],
      htn:    entry.htn    || '',
    });
    return id;
  },

  getPosition(id) {
    if (this.local[id]) return this._norm(this.local[id]);
    for (const data of Object.values(this.cache))
      if (data[id]) return this._norm(data[id]);
    return null;
  },

  positionsOf(libId) {
    if (libId === null) {
      // All active libraries, deduped by board encoding (local takes precedence)
      const seenBoards = new Set(), result = [];
      for (const id of [this.LOCAL, ...Object.keys(this.libs).filter(k => k !== this.LOCAL)]) {
        if (!this.libs[id]?.active) continue;
        for (const p of this.positionsOf(id)) {
          const boardId = p.board || p.key;
          if (!seenBoards.has(boardId)) { seenBoards.add(boardId); result.push(p); }
        }
      }
      return result;
    }
    if (libId === this.LOCAL) {
      const all     = Object.keys(this.local);
      const ordered = this.order.filter(k => all.includes(k));
      const rest    = all.filter(k => !this.order.includes(k));
      return [...ordered, ...rest].map(k => ({
        key:      k,
        sourceId: this.LOCAL,
        ...this._norm(this.local[k] || {}),
      }));
    }
    return Object.entries(this.cache[libId] || {})
      .map(([key, raw]) => ({ key, board: key, sourceId: libId, ...this._norm(raw) }));
  },

  tagsOf(libId) {
    const set = new Set();
    for (const p of this.positionsOf(libId)) for (const t of p.tags) set.add(t);
    return [...set].sort();
  },

  reorderLocal(fromKey, toKey, before) {
    const all   = Object.keys(this.local);
    let   order = [...new Set([...this.order.filter(k => all.includes(k)), ...all])];
    const from  = order.indexOf(fromKey);
    let   to    = order.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    order.splice(from, 1);
    to = order.indexOf(toKey);
    order.splice(before ? to : to + 1, 0, fromKey);
    this.order = order;
    this._saveOrder();
  },

  // Export in standard format (board encoding as key) for inter-app compatibility
  exportLocalJson() {
    const positions = {};
    for (const val of Object.values(this.local)) {
      const norm = this._norm(val);
      if (!norm.board) continue;
      const c = {};
      if (norm.title)         c.t = norm.title;
      if (norm.note)          c.n = norm.note;
      if (norm.labels.length) c.l = norm.labels.map(l => [l.q, l.r, l.letter]);
      if (norm.tags.length)   c.g = norm.tags;
      if (norm.htn)           c.h = norm.htn;
      positions[norm.board] = c;
    }
    return JSON.stringify({ positions }, null, 2);
  },

  _saveLibs()  { localStorage.setItem(this.LIBS_KEY,  JSON.stringify(this.libs));  },
  _saveLocal() { localStorage.setItem(this.LOCAL_KEY, JSON.stringify(this.local)); },
  _saveOrder() { localStorage.setItem(this.ORDER_KEY, JSON.stringify(this.order)); },
};

export { Store };