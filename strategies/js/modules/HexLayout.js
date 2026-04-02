const HexLayout = {
  spiralOrder(s) {
    const max  = s - 1;
    const dist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    const cells = [];
    for (let q = -max; q <= max; q++)
      for (let r = -max; r <= max; r++)
        if (Math.abs(q + r) <= max)
          cells.push({ q, r });
    return cells.sort((a, b) => {
      const dd = dist(a.q, a.r) - dist(b.q, b.r);
      return dd !== 0 ? dd : a.q !== b.q ? a.q - b.q : a.r - b.r;
    });
  },

  axialToPixel(q, r, R) {
    return { x: R * Math.sqrt(3) * (q + r / 2), y: R * 1.5 * r };
  },

  hexPath(cx, cy, R, inset) {
    const r = R - inset;
    return Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (Math.PI / 3) * i;
      return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    }).join(' ') + ' Z';
  },

  fitRadius(s, w, h, margin = 22) {
    const rW = (w - margin * 2) / (Math.sqrt(3) * (2 * s - 1));
    const rH = (h - margin * 2) / (3 * s - 1);
    return Math.max(5, Math.min(rW, rH));
  },
};

export { HexLayout };