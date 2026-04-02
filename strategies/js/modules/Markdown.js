const Markdown = {
  render(md) {
    if (!md) return '';
    const esc    = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`(.+?)`/g,       '<code>$1</code>');

    const renderList = block => {
      const lines = block.split('\n').filter(l => /^[ \t]*[-*] /.test(l));
      let html = '<ul>', inSub = false;
      for (const line of lines) {
        const nested = /^[ \t]{2,}[-*] /.test(line);
        const text   = inline(line.replace(/^[ \t]*[-*] /, ''));
        if (nested && !inSub) { html += '<ul>'; inSub = true; }
        if (!nested && inSub) { html += '</ul>'; inSub = false; }
        html += `<li>${text}</li>`;
      }
      if (inSub) html += '</ul>';
      return html + '</ul>';
    };

    return md.split(/\n\n+/).map(block => {
      const hm = block.match(/^(#{1,3}) (.+)/);
      if (hm) return `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`;
      if (/^[ \t]*[-*] /m.test(block)) return renderList(block);
      return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  },
};

export { Markdown };