import { HexGrid } from '/strategies/js/modules/HexGrid.js';

const HTN = {

  parse(source) {
    const s = source;
    let i = 0;

    const skipWS = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++; };

    const readCoord = () => {
      skipWS();
      if (s[i] !== '[') throw new Error('expected [');
      i++;
      skipWS();
      let sign = s[i] === '-' ? (i++, -1) : 1;
      let q = 0;
      while (i < s.length && s[i] >= '0' && s[i] <= '9') q = q * 10 + +s[i++];
      q *= sign;
      skipWS();
      if (s[i] !== ',') throw new Error('expected ,');
      i++;
      skipWS();
      sign = s[i] === '-' ? (i++, -1) : 1;
      let r = 0;
      while (i < s.length && s[i] >= '0' && s[i] <= '9') r = r * 10 + +s[i++];
      r *= sign;
      skipWS();
      if (s[i] !== ']') throw new Error('expected ]');
      i++;
      return { q, r };
    };

    const metadata = {};
    const turns    = [];

    skipWS();

    if (i < s.length && /[a-zA-Z]/.test(s[i])) {
      while (i < s.length) {
        skipWS();
        if (!s[i] || !/[a-zA-Z]/.test(s[i])) break;
        let key = '';
        while (i < s.length && /[a-zA-Z]/.test(s[i])) key += s[i++];
        skipWS();
        if (s[i] !== '[') break;
        i++;
        let val = '';
        while (i < s.length && s[i] !== ']') val += s[i++];
        if (s[i] === ']') i++;
        metadata[key] = val;
        skipWS();
        if (s[i] === ';') { i++; break; }
      }
    }

    while (i < s.length) {
      skipWS();
      if (i >= s.length || !/\d/.test(s[i])) break;
      let num = 0;
      while (i < s.length && /\d/.test(s[i])) num = num * 10 + +s[i++];
      skipWS();
      if (s[i] !== '.') break;
      i++;
      const c1 = readCoord();
      const c2 = readCoord();
      skipWS();
      let threats = 0;
      while (i < s.length && s[i] === '!') { threats++; i++; }
      skipWS();
      if (i < s.length && s[i] === ';') i++;
      turns.push({ num, coords: [c1, c2], threats });
    }

    return { metadata, turns };
  },

  stringify(metadata, turns) {
    const lines = [];
    if (metadata && Object.keys(metadata).length) {
      lines.push(Object.entries(metadata).map(([k, v]) => `${k}[${v}]`).join('') + ';');
    }
    for (const { num, coords, threats } of turns) {
      const cs = coords.map(c => `[${c.q},${c.r}]`).join('');
      lines.push(`${num}. ${cs}${'!'.repeat(threats || 0)};`);
    }
    return lines.join('\n');
  },

  inferSize(turns) {
    let max = 1;
    for (const { q, r } of [{ q: 0, r: 0 }, ...turns.flatMap(t => t.coords)]) {
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (d >= max) max = d + 1;
    }
    return Math.max(2, Math.ceil(max));
  },

  buildGrid(turns, upToTurn = Infinity) {
    const relevant = turns.filter(t => t.num <= upToTurn);
    const s        = HTN.inferSize(relevant);
    const grid     = HexGrid.create(s);
    HexGrid.setState(grid, 0, 0, 1);
    for (const { num, coords } of relevant) {
      const state = num % 2 === 1 ? 2 : 1;
      for (const { q, r } of coords) HexGrid.setState(grid, q, r, state);
    }
    return grid;
  },

  validate(turns) {
    const occupied = new Set(['0,0']);
    for (const { num, coords } of turns) {
      for (const { q, r } of coords) {
        const key = `${q},${r}`;
        if (occupied.has(key)) return { ok: false, turn: num, reason: `${key} already occupied` };
        occupied.add(key);
      }
    }
    return { ok: true };
  },
};

export { HTN };