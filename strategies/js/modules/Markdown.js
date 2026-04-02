const Markdown = {
  render(md) {
    if (!md) return '';
    const esc    = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`(.+?)`/g,       '<code>$1</code>');

    return md.split(/\n\n+/).map(block => {
      const hm = block.match(/^(#{1,3}) (.+)/);
      if (hm) return `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`;
      const li = block.match(/^[-*] .+/m);
      if (li) return '<ul>' + block.split('\n').filter(Boolean).map(l => `<li>${inline(l.replace(/^[-*] /, ''))}</li>`).join('') + '</ul>';
      return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  },
};

export { Markdown };