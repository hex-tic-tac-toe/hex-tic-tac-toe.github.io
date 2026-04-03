import { HexGrid }   from '/strategies/js/modules/HexGrid.js';
import { HexLayout } from '/strategies/js/modules/HexLayout.js';

const BoardRenderer = {
  _colors() {
    const s = getComputedStyle(document.documentElement);
    const v = k => s.getPropertyValue(k).trim();
    return {
      empty:   v('--hex-empty')   || '#1c1c1c',
      stroke:  v('--hex-stroke')  || '#2e2e2e',
      x:       v('--hex-x')       || '#c8c8c8',
      oStroke: v('--hex-o-stroke')|| '#888',
      oBg:     v('--hex-o-bg')    || '#111',
      oStripe: v('--hex-o-stripe')|| '#555',
      dot:     v('--hex-dot')     || '#3a3a3a',
      labelX:  v('--hex-label-x') || '#1a1a1a',
      labelO:  v('--hex-label-o') || '#a0a0a0',
      hover:   v('--hex-hover')   || '#262626',
    };
  },

  build(svgEl, grid, labels, opts = {}) {
    svgEl.innerHTML = '';
    const ns      = 'http://www.w3.org/2000/svg';
    const w       = opts.w ?? svgEl.parentElement.getBoundingClientRect().width;
    const h       = opts.h ?? svgEl.parentElement.getBoundingClientRect().height;
    const R       = HexLayout.fitRadius(grid.s, w, h, opts.margin ?? 22);
    const hatchId = 'ho' + Math.random().toString(36).slice(2, 7);
    const colors  = BoardRenderer._colors();
    svgEl._hatchId = hatchId;
    svgEl._colors  = colors;
    BoardRenderer._defs(svgEl, ns, R, hatchId, colors);

    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const c of grid.cells.values()) {
      const {x,y} = HexLayout.axialToPixel(c.q, c.r, R), hw = R * Math.sqrt(3) / 2;
      if (x-hw<minX) minX=x-hw; if (x+hw>maxX) maxX=x+hw;
      if (y-R <minY) minY=y-R;  if (y+R >maxY) maxY=y+R;
    }
    const pad=R*0.28, vw=maxX-minX+pad*2, vh=maxY-minY+pad*2, ox=-minX+pad, oy=-minY+pad;
    svgEl.setAttribute('viewBox', `0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    if (opts.mini) { svgEl.setAttribute('width','100%'); svgEl.setAttribute('height','100%'); }
    else { svgEl.setAttribute('width',vw.toFixed(1)); svgEl.setAttribute('height',vh.toFixed(1)); }
    svgEl._R = R;

    const lmap = BoardRenderer._labelMap(labels);
    for (const c of grid.cells.values()) {
      const {x,y} = HexLayout.axialToPixel(c.q, c.r, R);
      BoardRenderer._cell(svgEl, ns, c, x+ox, y+oy, R, lmap[HexGrid.key(c.q,c.r)]??null, opts.hover!==false, hatchId, colors);
    }
  },

  _defs(svgEl, ns, R, hatchId, colors) {
    const defs=document.createElementNS(ns,'defs'), sz=Math.max(3,R*0.22), lw=Math.max(1,sz*0.5);
    const pat=document.createElementNS(ns,'pattern');
    pat.setAttribute('id', hatchId); pat.setAttribute('patternUnits','userSpaceOnUse');
    pat.setAttribute('width',sz.toFixed(1)); pat.setAttribute('height',sz.toFixed(1));
    pat.setAttribute('patternTransform','rotate(45)');
    const bg=document.createElementNS(ns,'rect');
    bg.setAttribute('width',sz.toFixed(1)); bg.setAttribute('height',sz.toFixed(1)); bg.setAttribute('fill', colors.oBg);
    pat.appendChild(bg);
    const ln=document.createElementNS(ns,'line');
    ln.setAttribute('x1','0'); ln.setAttribute('y1','0'); ln.setAttribute('x2','0'); ln.setAttribute('y2',sz.toFixed(1));
    ln.setAttribute('stroke', colors.oStripe); ln.setAttribute('stroke-width',lw.toFixed(1));
    pat.appendChild(ln); defs.appendChild(pat); svgEl.appendChild(defs);
  },

  _labelMap(labels) {
    const tot={}, idx={}, map={};
    for (const l of labels) { const m=l.mark??l.letter??'a'; tot[m]=(tot[m]||0)+1; }
    for (const l of labels) {
      const m=l.mark??l.letter??'a', i=idx[m]??0; idx[m]=i+1;
      map[HexGrid.key(l.q,l.r)] = tot[m]>1 ? `${m}${i+1}` : m;
    }
    return map;
  },

  _cell(svgEl, ns, cell, cx, cy, R, label, hover, hatchId, colors) {
    const g=document.createElementNS(ns,'g');
    g.dataset.q=cell.q; g.dataset.r=cell.r; g.dataset.cx=cx.toFixed(2); g.dataset.cy=cy.toFixed(2);
    const face=document.createElementNS(ns,'path');
    face.setAttribute('d', HexLayout.hexPath(cx,cy,R,Math.max(1,R*0.09)));
    face.classList.add('cell-face'); BoardRenderer._fill(face, cell.state, hatchId, colors); g.appendChild(face);
    if (label) {
      const t=document.createElementNS(ns,'text');
      t.setAttribute('x',cx.toFixed(2)); t.setAttribute('y',cy.toFixed(2));
      t.setAttribute('text-anchor','middle'); t.setAttribute('dominant-baseline','central');
      t.setAttribute('font-size',(R*0.52).toFixed(1)); t.setAttribute('font-family','Courier New,monospace');
      t.setAttribute('fill', cell.state===1 ? colors.labelX : colors.labelO); t.setAttribute('pointer-events','none');
      t.textContent=label; g.appendChild(t);
    } else if (R>9) {
      const d=document.createElementNS(ns,'circle');
      d.setAttribute('cx',cx.toFixed(2)); d.setAttribute('cy',cy.toFixed(2)); d.setAttribute('r',(R*0.07).toFixed(2));
      d.setAttribute('fill', colors.dot); d.setAttribute('pointer-events','none'); d.classList.add('cell-dot'); g.appendChild(d);
    }
    if (hover) {
      g.addEventListener('mouseenter',()=>{ if(!cell.state) face.setAttribute('fill', colors.hover); });
      g.addEventListener('mouseleave',()=>BoardRenderer._fill(face, cell.state, hatchId, colors));
    }
    svgEl.appendChild(g);
  },

  _fill(face, s, hatchId, colors) {
    const h = hatchId || face.closest?.('svg')?._hatchId || 'hatch-o';
    const c = colors  || face.closest?.('svg')?._colors  || BoardRenderer._colors();
    if      (!s)    { face.setAttribute('fill', c.empty);         face.setAttribute('stroke', c.stroke); face.setAttribute('stroke-width','0.9'); }
    else if (s===1) { face.setAttribute('fill', c.x);             face.setAttribute('stroke','none'); }
    else            { face.setAttribute('fill', `url(#${h})`);    face.setAttribute('stroke', c.oStroke); face.setAttribute('stroke-width','1'); }
  },

  updateCell(svgEl, q, r, state) {
    const g=svgEl.querySelector(`[data-q="${q}"][data-r="${r}"]`);
    const f=g?.querySelector('.cell-face'); if (f) BoardRenderer._fill(f, state, svgEl._hatchId, svgEl._colors);
    const c = svgEl._colors || BoardRenderer._colors();
    const t=g?.querySelector('text'); if (t) t.setAttribute('fill', state===1 ? c.labelX : c.labelO);
  },
};

export { BoardRenderer };