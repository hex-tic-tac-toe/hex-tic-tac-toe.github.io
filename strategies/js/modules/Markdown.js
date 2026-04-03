const Markdown = {
  render(md) {
    if (!md) return '';
    const esc    = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`(.+?)`/g,       '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    const renderList = block => {
      const lines = block.split('\n');
      let html = '', inSub = false, i = 0;
      const preLines = [];
      while (i < lines.length && !/^[ \t]*[-*] /.test(lines[i])) {
        if (lines[i].trim()) preLines.push(lines[i]);
        i++;
      }
      if (preLines.length) html += `<p>${inline(preLines.join('\n')).replace(/\n/g, '<br>')}</p>`;
      html += '<ul>';
      for (; i < lines.length; i++) {
        if (!/^[ \t]*[-*] /.test(lines[i])) continue;
        const nested = /^[ \t]{2,}[-*] /.test(lines[i]);
        const text   = inline(lines[i].replace(/^[ \t]*[-*] /, ''));
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