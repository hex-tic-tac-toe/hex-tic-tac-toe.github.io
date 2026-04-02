const Database = {
  KEY:  'hexstrat-db',
  data: {},

  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
    catch { this.data = {}; }
  },

  save()        { localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  get(key)      { return this.data[key] ?? null; },
  set(key, val) { this.data[key] = val; this.save(); },
  delete(key)   { delete this.data[key]; this.save(); },
  toJSON()      { return JSON.stringify(this.data, null, 2); },

  positions() {
    const order = this.getOrder();
    const keyed = Object.entries(this.data)
      .filter(([k]) => !k.startsWith('_'))
      .map(([key, val]) => ({ key, ...val }));

    const indexed = new Map(keyed.map(p => [p.key, p]));
    const sorted  = order.filter(k => indexed.has(k)).map(k => indexed.get(k));
    const rest    = keyed.filter(p => !order.includes(p.key));
    return [...sorted, ...rest];
  },

  getLabels()    { return this.data['_labels'] || {}; },
  setLabels(obj) { this.data['_labels'] = obj; this.save(); },

  getOrder()     { return this.data['_order'] || []; },
  setOrder(arr)  { this.data['_order'] = arr; this.save(); },

  reorder(fromKey, toKey) {
    const order = this.positions().map(p => p.key);
    const from  = order.indexOf(fromKey);
    const to    = order.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    order.splice(from, 1);
    order.splice(to, 0, fromKey);
    this.setOrder(order);
  },

  reorderRelative(fromKey, toKey, before) {
    const order = this.positions().map(p => p.key);
    const from  = order.indexOf(fromKey);
    let   to    = order.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    order.splice(from, 1);
    to = order.indexOf(toKey);
    order.splice(before ? to : to + 1, 0, fromKey);
    this.setOrder(order);
  },
};

export { Database };