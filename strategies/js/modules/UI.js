import { Layout } from '/strategies/js/modules/Layout.js';

const UI = {
  activeView: 'browser',

  init(onResize) {
    window.addEventListener('resize', () => {
      if (UI.activeView === 'editor') onResize();
    });
  },

  showEditor(onEnter) {
    UI.activeView = 'editor';
    document.getElementById('view-editor').hidden  = false;
    document.getElementById('view-browser').hidden = true;
    document.getElementById('view-data').hidden    = true;
    UI._setActive('tab-editor', 'tab-editor-b', 'tab-editor-d');
    onEnter();
  },

  showBrowser(onEnter) {
    UI.activeView = 'browser';
    document.getElementById('view-browser').hidden = false;
    document.getElementById('view-editor').hidden  = true;
    document.getElementById('view-data').hidden    = true;
    UI._setActive('tab-browser', 'tab-browser-b', 'tab-browser-d');
    onEnter();
  },

  showData(onEnter) {
    UI.activeView = 'data';
    document.getElementById('view-data').hidden    = false;
    document.getElementById('view-editor').hidden  = true;
    document.getElementById('view-browser').hidden = true;
    UI._setActive('tab-data', 'tab-data-b', 'tab-data-d');
    onEnter();
  },

  _setActive(...activeIds) {
    const all = [
      'tab-editor','tab-editor-b','tab-editor-d',
      'tab-browser','tab-browser-b','tab-browser-d',
      'tab-data','tab-data-b','tab-data-d',
    ];
    for (const id of all) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', activeIds.includes(id));
    }
  },
};

export { UI };