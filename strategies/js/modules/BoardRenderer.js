import { HexGrid }   from '/strategies/js/modules/HexGrid.js';
import { HexLayout } from '/strategies/js/modules/HexLayout.js';

const BoardRenderer = {


  build(svgEl, grid, labels, opts = {}) {
    svgEl.innerHTML = '';
    const ns  = 'http://www.w3.org/2000/svg';
    const w   = opts.w ?? svgEl.parentElement.getBoundingClientRect().width;
    const h   = opts.h ?? svgEl.parentElement.getBoundingClientRect().height;
    const R   = HexLayout.fitRadius(grid.s, w, h, opts.margin ?? 22);

    BoardRenderer._addDefs(svgEl, ns, R);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of grid.cells.values()) {
      const { x, y } = HexLayout.axialToPixel(cell.q, cell.r, R);
      const hw = R * Math.sqrt(3) / 2;
      if (x - hw < minX) minX = x - hw;  if (x + hw > maxX) maxX = x + hw;
      if (y - R  < minY) minY = y - R;   if (y + R  > maxY) maxY = y + R;
    }

    const pad = R * 0.28;
    const vw  = maxX - minX + pad * 2;
    const vh  = maxY - minY + pad * 2;
    const ox  = -minX + pad;
    const oy  = -minY + pad;

    svgEl.setAttribute('viewBox', `0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    if (opts.mini) {
      svgEl.setAttribute('width',  '100%');
      svgEl.setAttribute('height', '100%');
    } else {
      svgEl.setAttribute('width',  vw.toFixed(1));
      svgEl.setAttribute('height', vh.toFixed(1));
    }
    svgEl._R = R;

    const labelMap = BoardRenderer._buildLabelMap(labels);

    for (const cell of grid.cells.values()) {
      const { x, y } = HexLayout.axialToPixel(cell.q, cell.r, R);
      const cx = x + ox, cy = y + oy;
      BoardRenderer._addCell(svgEl, ns, cell, cx, cy, R,
        labelMap[HexGrid.key(cell.q, cell.r)] ?? null,
        opts.hover !== false);
    }
  },

  _addDefs(svgEl, ns, R) {
    const defs    = document.createElementNS(ns, 'defs');
    const size    = Math.max(3, R * 0.22);
    const lw      = size * 0.2;
    const pattern = document.createElementNS(ns, 'pattern');
    pattern.setAttribute('id',               'hatch-o');
    pattern.setAttribute('patternUnits',     'userSpaceOnUse');
    pattern.setAttribute('width',            size.toFixed(1));
    pattern.setAttribute('height',           size.toFixed(1));
    pattern.setAttribute('patternTransform', 'rotate(45)');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width',  size.toFixed(1));
    bg.setAttribute('height', size.toFixed(1));
    bg.setAttribute('fill',   '#111');
    pattern.appendChild(bg);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
    line.setAttribute('x2', '0'); line.setAttribute('y2', size.toFixed(1));
    line.setAttribute('stroke', '#444'); line.setAttribute('stroke-width', lw.toFixed(1));
    pattern.appendChild(line);
    defs.appendChild(pattern);
    svgEl.appendChild(defs);
  },

  _buildLabelMap(labels) {
    const total = {}, idx = {}, map = {};
    labels.forEach(l => { total[l.letter] = (total[l.letter] || 0) + 1; });
    labels.forEach(l => {
      const i       = idx[l.letter] ?? 0;
      idx[l.letter] = i + 1;
      map[HexGrid.key(l.q, l.r)] = total[l.letter] > 1 ? `${l.letter}${i + 1}` : l.letter;
    });
    return map;
  },

  _addCell(svgEl, ns, cell, cx, cy, R, labelText, hover) {
    const g = document.createElementNS(ns, 'g');
    g.dataset.q  = cell.q;
    g.dataset.r  = cell.r;
    g.dataset.cx = cx.toFixed(2);
    g.dataset.cy = cy.toFixed(2);

    const face = document.createElementNS(ns, 'path');
    face.setAttribute('d', HexLayout.hexPath(cx, cy, R, Math.max(1, R * 0.09)));
    face.classList.add('cell-face');
    BoardRenderer._applyFill(face, cell.state);
    g.appendChild(face);

    if (labelText) {
      const fill = cell.state === 1 ? '#2a2a2a' : '#909090';
      const txt  = document.createElementNS(ns, 'text');
      txt.setAttribute('x',                 cx.toFixed(2));
      txt.setAttribute('y',                 cy.toFixed(2));
      txt.setAttribute('text-anchor',       'middle');
      txt.setAttribute('dominant-baseline', 'central');
      txt.setAttribute('font-size',         (R * 0.56).toFixed(1));
      txt.setAttribute('font-family',       'Courier New, monospace');
      txt.setAttribute('fill',              fill);
      txt.setAttribute('pointer-events',    'none');
      txt.textContent = labelText;
      g.appendChild(txt);
    } else if (R > 9) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', cx.toFixed(2));
      dot.setAttribute('cy', cy.toFixed(2));
      dot.setAttribute('r',  (R * 0.07).toFixed(2));
      dot.setAttribute('fill', '#2a2a2a');
      dot.setAttribute('pointer-events', 'none');
      dot.classList.add('cell-dot');
      g.appendChild(dot);
    }

    if (hover) {
      g.addEventListener('mouseenter', () => { if (cell.state === 0) face.setAttribute('fill', '#1e1e1e'); });
      g.addEventListener('mouseleave', () => BoardRenderer._applyFill(face, cell.state));
    }

    svgEl.appendChild(g);
  },

  _applyFill(face, state) {
    if (state === 0) {
      face.setAttribute('fill',         '#111');
      face.setAttribute('stroke',       '#1e1e1e');
      face.setAttribute('stroke-width', '0.8');
    } else if (state === 1) {
      face.setAttribute('fill',   '#c0c0c0');
      face.setAttribute('stroke', 'none');
    } else {
      face.setAttribute('fill',   'url(#hatch-o)');
      face.setAttribute('stroke',       '#c0c0c0');
      face.setAttribute('stroke-width', '0.8');
    }
  },

  updateCell(svgEl, q, r, state) {
    const g    = svgEl.querySelector(`[data-q="${q}"][data-r="${r}"]`);
    const face = g?.querySelector('.cell-face');
    if (face) BoardRenderer._applyFill(face, state);
    const txt = g?.querySelector('text');
    if (txt) txt.setAttribute('fill', state === 1 ? '#2a2a2a' : '#909090');
  },
};

export { BoardRenderer };