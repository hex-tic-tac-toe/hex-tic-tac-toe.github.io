const Doc = {
  uid: () => Math.random().toString(36).slice(2, 9),

  section: (title = 'New Section') => ({ type: 's', id: Doc.uid(), title, collapsed: false, children: [] }),
  text:    (md = '')               => ({ type: 't', id: Doc.uid(), md }),
  pos:     (board, title = '', note = '', labels = [], htn = '') => ({ type: 'p', id: Doc.uid(), board, title, note, labels, htn }),

  find(tree, id) {
    for (let i = 0; i < tree.length; i++) {
      if (tree[i].id === id) return [tree[i], tree, i];
      if (tree[i].children) { const f = Doc.find(tree[i].children, id); if (f) return f; }
    }
    return null;
  },

  move(tree, fromId, toId, before = true) {
    const f = Doc.find(tree, fromId); if (!f) return;
    const [node, parent] = f;
    parent.splice(f[2], 1);
    const t = Doc.find(tree, toId);
    if (!t) { tree.push(node); return; }
    t[1].splice(before ? t[2] : t[2] + 1, 0, node);
  },

  remove(tree, id) {
    const f = Doc.find(tree, id); if (f) f[1].splice(f[2], 1);
  },

  allPositions(tree) {
    const r = [];
    (function walk(nodes) { for (const n of nodes) { if (n.type === 'p') r.push(n); if (n.children) walk(n.children); } })(tree);
    return r;
  },

  fromV0(positions = {}) {
    const groups = new Map(), ungrouped = [];
    for (const [board, raw] of Object.entries(positions)) {
      const tags   = raw.g || raw.tags || [];
      const labels = (raw.l || raw.labels || []).map(l => Array.isArray(l) ? l : [l.q, l.r, l.letter || l.mark || 'a']);
      const node   = Doc.pos(board, raw.t || raw.title || '', raw.n || raw.note || '', labels, raw.h || raw.htn || '');
      if (tags[0]) { if (!groups.has(tags[0])) groups.set(tags[0], []); groups.get(tags[0]).push(node); }
      else ungrouped.push(node);
    }
    const doc = [];
    for (const [title, nodes] of groups) { const s = Doc.section(title); s.children = nodes; doc.push(s); }
    return [...doc, ...ungrouped];
  },
};

export { Doc };