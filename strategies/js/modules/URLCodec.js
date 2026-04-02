import { HexGrid }   from '/strategies/js/modules/HexGrid.js';
import { HexLayout } from '/strategies/js/modules/HexLayout.js';

// Encodes hex grid state and letter labels for URL sharing.
// Board encoding:  size(5b) + cell states(2b each), bit-packed base64url.
// Label encoding:  count(6b) + [spiralIndex(10b) + letter(5b)] per label.
// Share format:    "boardEnc~labelsEnc"  (labels part omitted when empty)

const URLCodec = {

  encode(grid) {
    const order        = HexLayout.spiralOrder(grid.s);
    let   lastNonEmpty = -1;
    for (let i = order.length - 1; i >= 0; i--) {
      if (HexGrid.cell(grid, order[i].q, order[i].r)?.state !== 0) { lastNonEmpty = i; break; }
    }
    const cellCount = lastNonEmpty + 1;
    const bytes     = new Uint8Array(Math.ceil((5 + cellCount * 2) / 8));
    let   pos       = 0;
    const write     = (val, bits) => {
      for (let i = bits - 1; i >= 0; i--) {
        if ((val >> i) & 1) bytes[pos >> 3] |= 1 << (7 - (pos & 7));
        pos++;
      }
    };
    write(grid.s - 1, 5);
    for (let i = 0; i < cellCount; i++)
      write(HexGrid.cell(grid, order[i].q, order[i].r)?.state ?? 0, 2);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  },

  decode(str) {
    if (!str) return null;
    try {
      const pad   = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - str.length % 4) % 4);
      const bytes = Uint8Array.from(atob(pad), c => c.charCodeAt(0));
      let   pos   = 0;
      const read  = bits => {
        let val = 0;
        for (let i = bits - 1; i >= 0; i--) {
          if ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1) val |= 1 << i;
          pos++;
        }
        return val;
      };
      const s = read(5) + 1;
      if (s < 2 || s > 32) return null;
      const grid  = HexGrid.create(s);
      const order = HexLayout.spiralOrder(s);
      const count = Math.min(Math.floor((bytes.length * 8 - pos) / 2), order.length);
      for (let i = 0; i < count; i++) HexGrid.setState(grid, order[i].q, order[i].r, read(2));
      return grid;
    } catch { return null; }
  },

  encodeLabels(labels, grid) {
    if (!labels.length) return '';
    const order    = HexLayout.spiralOrder(grid.s);
    const indexMap = new Map(order.map((c, i) => [HexGrid.key(c.q, c.r), i]));
    const bytes    = new Uint8Array(Math.ceil((6 + labels.length * 15) / 8));
    let   pos      = 0;
    const write    = (val, bits) => {
      for (let i = bits - 1; i >= 0; i--) {
        if ((val >> i) & 1) bytes[pos >> 3] |= 1 << (7 - (pos & 7));
        pos++;
      }
    };
    write(labels.length, 6);
    for (const l of labels) {
      write(indexMap.get(HexGrid.key(l.q, l.r)) ?? 0, 10);
      write(l.letter.charCodeAt(0) - 97, 5);
    }
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  },

  decodeLabels(str, grid) {
    if (!str) return [];
    try {
      const pad   = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - str.length % 4) % 4);
      const bytes = Uint8Array.from(atob(pad), c => c.charCodeAt(0));
      let   pos   = 0;
      const read  = bits => {
        let val = 0;
        for (let i = bits - 1; i >= 0; i--) {
          if ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1) val |= 1 << i;
          pos++;
        }
        return val;
      };
      const order  = HexLayout.spiralOrder(grid.s);
      const count  = Math.min(read(6), 63);
      const labels = [];
      for (let i = 0; i < count; i++) {
        const idx  = read(10);
        const code = read(5);
        if (idx < order.length)
          labels.push({ q: order[idx].q, r: order[idx].r, letter: String.fromCharCode(97 + code) });
      }
      return labels;
    } catch { return []; }
  },

  encodeFull(grid, labels = []) {
    const board = this.encode(grid);
    const lbls  = this.encodeLabels(labels, grid);
    return lbls ? `${board}~${lbls}` : board;
  },

  decodeFull(str) {
    if (!str) return null;
    const tilde    = str.indexOf('~');
    const boardStr = tilde === -1 ? str               : str.slice(0, tilde);
    const lblsStr  = tilde === -1 ? ''                : str.slice(tilde + 1);
    const grid     = this.decode(boardStr);
    if (!grid) return null;
    return { grid, labels: this.decodeLabels(lblsStr, grid) };
  },
};

export { URLCodec };