import { HexGrid }   from '/strategies/js/modules/HexGrid.js';
import { HexLayout } from '/strategies/js/modules/HexLayout.js';

const URLCodec = {
  encode(grid) {
    const order = HexLayout.spiralOrder(grid.s);
    let last = -1;
    for (let i = order.length - 1; i >= 0; i--) { if (HexGrid.cell(grid, order[i].q, order[i].r)?.state) { last = i; break; } }
    const bytes = new Uint8Array(Math.ceil((5 + (last + 1) * 2) / 8));
    let pos = 0;
    const w = (v, b) => { for (let i = b-1; i >= 0; i--) { if ((v>>i)&1) bytes[pos>>3] |= 1<<(7-(pos&7)); pos++; } };
    w(grid.s - 1, 5);
    for (let i = 0; i <= last; i++) w(HexGrid.cell(grid, order[i].q, order[i].r)?.state ?? 0, 2);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  },

  decode(str) {
    if (!str) return null;
    try {
      const bytes = Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice(0,(4-str.length%4)%4)), c => c.charCodeAt(0));
      let pos = 0;
      const r = b => { let v=0; for(let i=b-1;i>=0;i--){ if((bytes[pos>>3]>>(7-(pos&7)))&1) v|=1<<i; pos++; } return v; };
      const s = r(5) + 1;
      if (s < 2 || s > 32) return null;
      const grid = HexGrid.create(s), order = HexLayout.spiralOrder(s);
      const cellCount = Math.min(Math.floor((bytes.length * 8 - pos) / 2), order.length);
      for (let i = 0; i < cellCount; i++)
        HexGrid.setState(grid, order[i].q, order[i].r, r(2));
      return grid;
    } catch { return null; }
  },

  encodeLabels(labels, grid) {
    if (!labels.length) return '';
    const order  = HexLayout.spiralOrder(grid.s);
    const imap   = new Map(order.map((c,i) => [HexGrid.key(c.q,c.r), i]));
    const bytes  = new Uint8Array(Math.ceil((6 + labels.length * 16) / 8));
    let pos = 0;
    const w = (v, b) => { for (let i=b-1;i>=0;i--){ if((v>>i)&1) bytes[pos>>3]|=1<<(7-(pos&7)); pos++; } };
    w(labels.length, 6);
    for (const l of labels) {
      const mark  = l.mark ?? l.letter ?? 'a';
      const isNum = !isNaN(Number(mark)) && mark !== '';
      const val   = isNum ? 25 + Math.min(38, Number(mark)) : Math.min(25, Math.max(0, mark.charCodeAt(0) - 97));
      w(imap.get(HexGrid.key(l.q, l.r)) ?? 0, 10);
      w(Math.min(63, val), 6);
    }
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  },

  decodeLabels(str, grid) {
    if (!str) return [];
    try {
      const bytes = Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice(0,(4-str.length%4)%4)), c => c.charCodeAt(0));
      let pos = 0;
      const r     = b => { let v=0; for(let i=b-1;i>=0;i--){ if((bytes[pos>>3]>>(7-(pos&7)))&1) v|=1<<i; pos++; } return v; };
      const order = HexLayout.spiralOrder(grid.s);
      const count = Math.min(r(6), 63);
      const bitsLeft = bytes.length * 8 - 6;
      const bitsPerLabel = bitsLeft >= count * 16 ? 16 : 15;
      pos = 6;
      return Array.from({ length: count }, () => {
        const idx = r(10), val = r(bitsPerLabel === 16 ? 6 : 5);
        if (idx >= order.length) return null;
        const mark = val <= 25 ? String.fromCharCode(97 + val) : String(val - 25);
        return { q: order[idx].q, r: order[idx].r, mark };
      }).filter(Boolean);
    } catch { return []; }
  },

  encodeFull(grid, labels = []) {
    const b = this.encode(grid), l = this.encodeLabels(labels, grid);
    return l ? `${b}~${l}` : b;
  },

  decodeFull(str) {
    if (!str) return null;
    const t = str.indexOf('~');
    const grid = this.decode(t === -1 ? str : str.slice(0, t));
    if (!grid) return null;
    return { grid, labels: this.decodeLabels(t === -1 ? '' : str.slice(t + 1), grid) };
  },
};

export { URLCodec };