import { HexGrid } from '/strategies/js/modules/HexGrid.js';
import { HTN }     from '/strategies/js/modules/HTN.js';

const Notation = {
  _dist: (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2,

  
  _ringCells(d) {
    if (d === 0) return [{ q: 0, r: 0 }];
    const dirs = [[-1,1],[-1,0],[0,-1],[1,-1],[1,0],[0,1]];
    const cells = []; let q = d, r = 0;
    for (const [dq, dr] of dirs)
      for (let i = 0; i < d; i++) { cells.push({ q, r }); q += dq; r += dr; }
    return cells;
  },

  _bkeLetter(d) {
    
    if (d <= 0) return 'Z';
    let s = '', n = d;
    while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); }
    return s;
  },

  _bkeLetterToD(letter) {
    if (letter === 'Z') return 0;
    let d = 0;
    for (let i = 0; i < letter.length; i++) d = d * 26 + (letter.charCodeAt(i) - 64);
    return d;
  },

  
  _buildRefMap(firstO) {
    if (!firstO) return null;
    const angle = Math.atan2(
      firstO.r * Math.sqrt(3) / 2,
      firstO.q + firstO.r / 2
    );
    const map = new Map();
    for (let d = 1; d <= 30; d++) {
      const cells = Notation._ringCells(d);
      let best = 0, bestDiff = Infinity;
      for (let i = 0; i < cells.length; i++) {
        const a = Math.atan2(cells[i].r * Math.sqrt(3) / 2, cells[i].q + cells[i].r / 2);
        const diff = Math.abs(((a - angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      map.set(d, best);
    }
    return map;
  },

  _bkeCoord(q, r, refMap) {
    const d = Notation._dist(q, r);
    if (d === 0) return 'Z0';
    const cells = Notation._ringCells(d);
    const nat   = cells.findIndex(c => c.q === q && c.r === r);
    const ref   = refMap?.get(d) ?? 0;
    return `${Notation._bkeLetter(d)}${(nat - ref + cells.length) % cells.length}`;
  },

  _bkeSortKey(q, r) {
    const d   = Notation._dist(q, r);
    const idx = Notation._ringCells(d).findIndex(c => c.q === q && c.r === r);
    return d * 1000 + idx;
  },

  _sortStones(stones) {
    return stones.slice().sort((a, b) => Notation._bkeSortKey(a.q, a.r) - Notation._bkeSortKey(b.q, b.r));
  },

  

  gridToBKE(grid) {
    const x = [], o = [];
    for (const c of grid.cells.values()) {
      if (c.state === 1) x.push(c); else if (c.state === 2) o.push(c);
    }
    const xRest = Notation._sortStones(x.filter(c => !(c.q === 0 && c.r === 0)));
    const os    = Notation._sortStones(o);
    const refMap = Notation._buildRefMap(os[0] || null);
    const fmt    = c => Notation._bkeCoord(c.q, c.r, refMap);
    const tokens = [];
    let xi = 0, oi = 0, turn = 0;
    while (oi < os.length || xi < xRest.length) {
      if (turn % 2 === 0 && oi < os.length) {
        const a = os[oi++], b = oi < os.length ? os[oi++] : null;
        tokens.push('o ' + fmt(a) + (b ? ' ' + fmt(b) : ''));
      } else if (turn % 2 === 1 && xi < xRest.length) {
        const a = xRest[xi++], b = xi < xRest.length ? xRest[xi++] : null;
        tokens.push('x ' + fmt(a) + (b ? ' ' + fmt(b) : ''));
      } else { turn++; continue; }
      turn++;
    }
    return tokens.join(' ');
  },

  gridToAxial(grid) {
    const x = [], o = [];
    for (const c of grid.cells.values()) {
      if (c.state === 1) x.push(`[${c.q},${c.r}]`); else if (c.state === 2) o.push(`[${c.q},${c.r}]`);
    }
    return [x.length ? 'X: ' + x.join(' ') : '', o.length ? 'O: ' + o.join(' ') : ''].filter(Boolean).join('\n');
  },

  gridToHTN(grid) {
    const xs = [], os = [];
    for (const c of grid.cells.values()) {
      if (c.state === 1 && !(c.q === 0 && c.r === 0)) xs.push(c); else if (c.state === 2) os.push(c);
    }
    Notation._sortStones(xs); Notation._sortStones(os);
    
    const lines = []; let oi = 0, xi = 0, t = 1;
    while (oi < os.length || xi < xs.length) {
      let pair;
      if (t % 2 === 1 && oi < os.length) {
        const a = os[oi++], b = oi < os.length ? os[oi++] : a;
        pair = [a, b];
      } else if (t % 2 === 0 && xi < xs.length) {
        const a = xs[xi++], b = xi < xs.length ? xs[xi++] : a;
        pair = [a, b];
      } else { t++; continue; }
      lines.push(`${t}. [${pair[0].q},${pair[0].r}][${pair[1].q},${pair[1].r}];`);
      t++;
    }
    return lines.join('\n');
  },

  

  fromHTN(text) {
    try {
      const { turns } = HTN.parse(text.trim());
      if (!turns.length) return null;
      return HTN.buildGrid(turns);
    } catch { return null; }
  },

  fromAxial(text) {
    const stones = [];
    for (const [, side, coords] of text.matchAll(/([XO]):\s*([\[\]\-\d,\s]+)/gi)) {
      const state = side.toUpperCase() === 'X' ? 1 : 2;
      for (const [, q, r] of coords.matchAll(/\[(-?\d+),(-?\d+)\]/g))
        stones.push({ q: +q, r: +r, state });
    }
    if (!stones.length) return null;
    if (!stones.some(s => s.q === 0 && s.r === 0)) stones.unshift({ q: 0, r: 0, state: 1 });
    let maxD = 1;
    for (const { q, r } of stones) { const d = Notation._dist(q, r); if (d >= maxD) maxD = d + 1; }
    const grid = HexGrid.create(Math.max(2, Math.ceil(maxD)));
    for (const { q, r, state } of stones) HexGrid.setState(grid, q, r, state);
    return grid;
  },

  fromBKE(text) {
    const tokens = text.trim().split(/\s+/);
    let state = 1;
    const raw = []; 
    for (const tok of tokens) {
      if (tok === 'x') { state = 1; continue; }
      if (tok === 'o') { state = 2; continue; }
      const m = tok.match(/^([A-Z]+)(\d+)$/i);
      if (m) raw.push({ letter: m[1].toUpperCase(), offset: +m[2], state });
    }
    if (!raw.length) return null;

    
    const stones = raw.map(({ letter, offset, state }) => {
      const d = Notation._bkeLetterToD(letter);
      if (d === 0) return { q: 0, r: 0, state };
      const cells = Notation._ringCells(d);
      const idx   = offset % cells.length;
      return { ...cells[idx], state };
    });

    let maxD = 1;
    for (const { q, r } of stones) { const d = Notation._dist(q, r); if (d >= maxD) maxD = d + 1; }
    const grid = HexGrid.create(Math.max(2, Math.ceil(maxD)));
    for (const { q, r, state } of stones) HexGrid.setState(grid, q, r, state);
    return grid;
  },

  

  parseMulti(text) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.map(s => String(s));
    } catch {}
    return [text]; 
  },

  gridFromFmt(text, fmt) {
    if (fmt === 'htn')   return Notation.fromHTN(text);
    if (fmt === 'axial') return Notation.fromAxial(text);
    if (fmt === 'bke')   return Notation.fromBKE(text);
    return null;
  },

  gridToFmt(grid, fmt) {
    if (fmt === 'htn')   return Notation.gridToHTN(grid);
    if (fmt === 'axial') return Notation.gridToAxial(grid);
    if (fmt === 'bke')   return Notation.gridToBKE(grid);
    return '';
  },

  convertBatch(entries, fromFmt, toFmt) {
    return entries.map(text => {
      const grid = Notation.gridFromFmt(text, fromFmt);
      return grid ? Notation.gridToFmt(grid, toFmt) : '(parse error)';
    });
  },
};

export { Notation };