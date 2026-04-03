import { Doc }           from '/strategies/js/modules/Doc.js';
import { Store }         from '/strategies/js/modules/Store.js';
import { Markdown }      from '/strategies/js/modules/Markdown.js';
import { URLCodec }      from '/strategies/js/modules/URLCodec.js';
import { BoardRenderer } from '/strategies/js/modules/BoardRenderer.js';
import { HexGrid }       from '/strategies/js/modules/HexGrid.js';

const Browser = {
  activeLibId:   null,
  _doc:          null,
  _editable:     false,
  _onOpen:       null,
  insertContext: null,
  _activeSec:    null,

  init(onOpenPosition) { Browser._onOpen = onOpenPosition; },

  render(libId, noHashUpdate) {
    Browser.activeLibId = libId;
    const libData       = Store.getDoc(libId);
    Browser._doc        = libData?.doc || [];
    Browser._editable   = Store.isLocal(libId);
    Browser._renderNav();
    Browser._renderDoc();
    if (!noHashUpdate) history.replaceState(null, '', '#b/' + libId);
  },

  scrollToSection(secId) {
    const el = document.getElementById('dn-' + secId);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', '#b/' + Browser.activeLibId + '/' + secId); }
  },

  setAllCollapsed(collapsed) {
    const walk = nodes => nodes.forEach(n => { if (n.type === 's') { n.collapsed = collapsed; walk(n.children || []); } });
    walk(Browser._doc);
    if (Browser._editable) Browser._save();
    Browser._renderDoc(); Browser._renderNav();
  },

  _renderNav() {
    const nav   = document.getElementById('lib-nav');
    const crumb = document.getElementById('browser-crumb');
    nav.innerHTML = '';
    const entries = [[Store.LOCAL, Store.libs[Store.LOCAL]], ...Object.entries(Store.libs).filter(([id]) => id !== Store.LOCAL)];
    for (const [id, lib] of entries) {
      if (!lib) continue;
      const el = document.createElement('div');
      el.className = 'lib-nav-item' + (Browser.activeLibId===id?' active':'') + (!lib.active&&!lib.local?' dim':'');
      el.textContent = lib.name;
      el.addEventListener('click', () => Browser.render(id));
      nav.appendChild(el);
      if (Browser.activeLibId === id) Browser._navSections(nav, Browser._doc, 1);
    }
    if (crumb) {
      const sec = Browser._activeSec ? Doc.find(Browser._doc, Browser._activeSec)?.[0] : null;
      crumb.textContent = sec?.title || '';
      crumb.hidden = !sec;
    }
  },

  _navSections(nav, nodes, depth) {
    for (const n of nodes) {
      if (n.type !== 's') continue;
      const el = document.createElement('div');
      el.className = 'lib-nav-sec' + (Browser._activeSec === n.id ? ' active' : '');
      el.style.paddingLeft = (8 + depth * 12) + 'px';
      el.dataset.id = n.id;
      el.textContent = n.title;
      el.addEventListener('click', e => {
        e.stopPropagation();
        Browser._activeSec = n.id;
        Browser._renderNav();
        Browser.scrollToSection(n.id);
      });
      nav.appendChild(el);
      if (!n.collapsed && n.children) Browser._navSections(nav, n.children, depth + 1);
    }
  },

  _renderDoc() {
    const main = document.getElementById('browser-doc');
    main.innerHTML = '';
    main.classList.toggle('browser-editable', Browser._editable);
    if (!Browser.activeLibId || !Browser._doc.length) {
      const msg = document.createElement('div');
      msg.className = 'browser-empty';
      msg.textContent = Browser.activeLibId ? (Browser._editable ? 'Empty — use + buttons to add content.' : 'Empty library.') : 'Select a library.';
      main.appendChild(msg);
      if (Browser._editable && Browser.activeLibId) { const bar = Browser._addBar(Browser._doc, 0); bar.classList.add('always-visible'); main.appendChild(bar); }
      return;
    }
    Browser._renderNodes(main, Browser._doc);
    Browser._applySearch(document.getElementById('browser-search')?.value || '');
  },

  _renderNodes(container, nodes) {
    if (Browser._editable) container.appendChild(Browser._addBar(nodes, 0));
    for (let i = 0; i < nodes.length; i++) {
      container.appendChild(Browser._renderNode(nodes[i]));
      if (Browser._editable) container.appendChild(Browser._addBar(nodes, i + 1));
    }
  },

  _renderNode(node) {
    const el = document.createElement('div');
    el.className = 'doc-node doc-' + node.type;
    el.id = 'dn-' + node.id;
    if (node.type === 's') Browser._buildSection(el, node);
    else if (node.type === 't') Browser._buildText(el, node);
    else if (node.type === 'p') Browser._buildPos(el, node);
    if (Browser._editable) Browser._attachDrag(el, node);
    return el;
  },

  _buildSection(el, node) {
    const hdr = document.createElement('div');
    hdr.className = 'doc-sec-hdr';
    if (Browser._editable) { const h = Browser._el('span','drag-handle','⠿'); h.draggable = false; hdr.appendChild(h); }
    const btn = Browser._el('span', 'collapse-btn', node.collapsed ? '▸' : '▾');
    const ttl = Browser._el('span', 'sec-title', node.title);
    if (Browser._editable) {
      ttl.contentEditable = 'true';
      ttl.addEventListener('blur',    () => { node.title = ttl.textContent.trim() || node.title; Browser._save(); });
      ttl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ttl.blur(); } });
    }
    hdr.appendChild(btn); hdr.appendChild(ttl);

    const linkBtn = document.createElement('button'); linkBtn.className = 'sec-link-btn'; linkBtn.textContent = '🔗'; linkBtn.title = 'Copy link to section';
    linkBtn.addEventListener('click', e => {
      e.stopPropagation();
      const url = location.origin + location.pathname + '#b/' + Browser.activeLibId + '/' + node.id;
      navigator.clipboard?.writeText(url);
      Browser._activeSec = node.id; Browser._renderNav();
      history.replaceState(null, '', '#b/' + Browser.activeLibId + '/' + node.id);
    });
    hdr.appendChild(linkBtn);

    if (Browser._editable) {
      const act = document.createElement('div'); act.className = 'sec-actions';
      act.appendChild(Browser._btn('+section', () => { node.children.push(Doc.section()); Browser._save(); Browser._renderDoc(); Browser._renderNav(); }));
      act.appendChild(Browser._btn('+text',    () => { node.children.push(Doc.text());    Browser._save(); Browser._renderDoc(); }));
      act.appendChild(Browser._btn('+pos',     () => { Browser.insertContext = { list: node.children, idx: node.children.length }; Browser._onOpen?.(null); }));
      const del = Browser._btn('✕', () => { if (!confirm('Delete section and contents?')) return; Doc.remove(Browser._doc, node.id); Browser._save(); Browser._renderDoc(); Browser._renderNav(); });
      del.style.marginLeft = 'auto';
      act.appendChild(del); hdr.appendChild(act);
    }
    el.appendChild(hdr);
    const body = document.createElement('div');
    body.className = 'doc-sec-body';
    body.hidden = !!node.collapsed;
    node.children = node.children || [];
    Browser._renderNodes(body, node.children);
    el.appendChild(body);
    const toggleCollapse = () => {
      node.collapsed = !node.collapsed; btn.textContent = node.collapsed ? '▸' : '▾'; body.hidden = !!node.collapsed;
      if (Browser._editable) Browser._save();
      Browser._renderNav();
    };
    btn.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(); });
    hdr.addEventListener('click', e => {
      if (e.target.closest('.sec-actions') || e.target.closest('.drag-handle') || e.target.closest('.sec-link-btn')) return;
      if (e.target === ttl && ttl.isContentEditable) return;
      toggleCollapse();
    });
  },

  _buildText(el, node) {
    if (Browser._editable) { const h = Browser._el('span','drag-handle','⠿'); el.appendChild(h); }
    let monoActive = !!node.mono;
    const view = document.createElement('div'); view.className = 'md-body';
    view.innerHTML = Markdown.render(node.md || '') || '<span class="md-placeholder">Click to edit…</span>';
    const raw = document.createElement('pre'); raw.className = 'md-raw'; raw.hidden = true;
    raw.textContent = node.md || '';
    if (monoActive) { view.hidden = true; raw.hidden = false; }
    const monoBtn = document.createElement('button'); monoBtn.className = 'mono-toggle'; monoBtn.textContent = '{ }'; monoBtn.title = 'Toggle monospace view';
    monoBtn.classList.toggle('active', monoActive);
    monoBtn.addEventListener('click', e => {
      e.stopPropagation(); monoActive = !monoActive; node.mono = monoActive;
      monoBtn.classList.toggle('active', monoActive);
      view.hidden = monoActive; raw.hidden = !monoActive;
      raw.textContent = node.md || '';
      Browser._save();
    });
    el.appendChild(monoBtn); el.appendChild(view); el.appendChild(raw);
    if (Browser._editable) {
      const ta = document.createElement('textarea'); ta.className = 'doc-text-ta'; ta.value = node.md || ''; ta.hidden = true; ta.placeholder = 'Markdown…';
      const autosize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      const openEdit = () => { view.hidden = true; raw.hidden = true; ta.hidden = false; autosize(); ta.focus({ preventScroll: true }); };
      view.addEventListener('click', openEdit);
      raw.addEventListener('click', openEdit);
      ta.addEventListener('input', autosize);
      ta.addEventListener('blur', () => {
        node.md = ta.value;
        view.innerHTML = Markdown.render(node.md) || '<span class="md-placeholder">Click to edit…</span>';
        raw.textContent = node.md;
        view.hidden = monoActive; raw.hidden = !monoActive; ta.hidden = true;
        Browser._save();
      });
      ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur(); });
      const del = Browser._btn('✕', () => { Doc.remove(Browser._doc, node.id); Browser._save(); Browser._renderDoc(); });
      del.className += ' node-del-btn';
      el.appendChild(ta); el.appendChild(del);
    }
  },

  _buildPos(el, node) {
    const grid = URLCodec.decode(node.board); if (!grid) return;
    if (Browser._editable) { const h = Browser._el('span','drag-handle','⠿'); el.appendChild(h); }
    el.tabIndex = 0;
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { Browser._onOpen?.(node); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); Browser._focusNextCard(el, 1); }
      if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  { e.preventDefault(); Browser._focusNextCard(el, -1); }
    });
    const board = document.createElement('div'); board.className = 'card-board';
    const svg   = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); board.appendChild(svg);
    const labels = (node.labels || []).map(l => Array.isArray(l) ? { q:l[0], r:l[1], mark:l[2] } : { ...l, mark: l.mark??l.letter??'a' });
    BoardRenderer.build(svg, grid, labels, { w:220, h:180, margin:8, mini:true, hover:false });
    const meta = document.createElement('div'); meta.className = 'card-meta';
    if (node.title) meta.appendChild(Browser._el('div','card-title',node.title));
    if (node.note)  meta.appendChild(Browser._el('div','card-note',node.note.split('\n')[0]));
    const { x, o } = HexGrid.countStones(grid);
    meta.appendChild(Browser._el('div', 'card-stats', `X ${x}  O ${o}  s${grid.s}`));
    if (Browser._editable) {
      const act = document.createElement('div'); act.className = 'card-actions';
      act.appendChild(Browser._btn('✕ delete', () => { if (!confirm(`Delete "${node.title||node.board}"?`)) return; Doc.remove(Browser._doc,node.id); Browser._save(); Browser._renderDoc(); }));
      meta.appendChild(act);
    }
    el.appendChild(board); el.appendChild(meta);
    board.addEventListener('click', () => Browser._onOpen?.(node));
  },

  _focusNextCard(current, dir) {
    const cards = [...document.querySelectorAll('.doc-p[tabindex="0"]')];
    const idx   = cards.indexOf(current);
    const next  = cards[idx + dir];
    if (next) next.focus({ preventScroll: false });
  },

  _applySearch(q) {
    const query = q.toLowerCase().trim();
    const btn   = document.getElementById('btn-search-clear');
    if (btn) btn.hidden = !q;

    if (!query) {
      document.querySelectorAll('#browser-doc .doc-node').forEach(el => el.hidden = false);
      return;
    }

    const nodeMatches = node => {
      if (node.type === 't') return (node.md||'').toLowerCase().includes(query);
      if (node.type === 'p') return ((node.title||'') + ' ' + (node.note||'')).toLowerCase().includes(query);
      if (node.type === 's') return (node.title||'').toLowerCase().includes(query) || (node.children||[]).some(c => nodeMatches(c));
      return false;
    };

    const applyNode = (node, parentTitleMatch) => {
      const el = document.getElementById('dn-' + node.id);
      if (!el) return;
      if (node.type === 's') {
        const titleMatch = (node.title||'').toLowerCase().includes(query);
        const anyMatch   = nodeMatches(node);
        el.hidden = !anyMatch;
        if (anyMatch) (node.children||[]).forEach(c => applyNode(c, titleMatch || parentTitleMatch));
      } else {
        el.hidden = parentTitleMatch ? false : !nodeMatches(node);
      }
    };

    Browser._doc.forEach(node => applyNode(node, false));
  },

  _addBar(list, insertIdx) {
    const bar = document.createElement('div'); bar.className = 'doc-add-bar';
    bar.appendChild(Browser._btn('+ section', () => { list.splice(insertIdx, 0, Doc.section()); Browser._save(); Browser._renderDoc(); Browser._renderNav(); }));
    bar.appendChild(Browser._btn('+ text',    () => { list.splice(insertIdx, 0, Doc.text());    Browser._save(); Browser._renderDoc(); }));
    return bar;
  },

  _attachDrag(el, node) {
    const handle = el.querySelector('.drag-handle');
    if (handle) {
      handle.draggable = true;
      handle.addEventListener('dragstart', e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', node.id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => el.classList.add('dragging'), 0); });
    }
    el.addEventListener('dragend',   () => el.classList.remove('dragging', 'drag-over'));
    el.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); });
    el.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('drag-over');
      const fromId = e.dataTransfer.getData('text/plain'); if (fromId === node.id) return;
      const before = e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2;
      Doc.move(Browser._doc, fromId, node.id, before);
      Browser._save(); Browser._renderDoc();
    });
  },

  _save() { Store.saveDoc(Browser.activeLibId, Browser._doc); },
  _el(tag, cls, text) { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; },
  _btn(text, onClick) {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = text;
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); }); return b;
  },
};

export { Browser };