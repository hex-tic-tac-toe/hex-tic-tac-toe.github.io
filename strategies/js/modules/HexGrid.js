const HexGrid = {
  create(s) {
    const max = s - 1;
    const cells = new Map();
    for (let q = -max; q <= max; q++)
      for (let r = -max; r <= max; r++)
        if (Math.abs(q + r) <= max)
          cells.set(`${q},${r}`, { q, r, state: 0 });
    return { s, cells };
  },

  key:  (q, r) => `${q},${r}`,
  cell: (grid, q, r) => grid.cells.get(`${q},${r}`) ?? null,

  setState(grid, q, r, state) {
    const c = grid.cells.get(`${q},${r}`);
    if (c) c.state = state;
  },

  countStones(grid) {
    let x = 0, o = 0;
    for (const c of grid.cells.values()) {
      if      (c.state === 1) x++;
      else if (c.state === 2) o++;
    }
    return { x, o, total: x + o };
  },
};

export { HexGrid };