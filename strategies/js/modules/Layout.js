const Layout = {
  HEADER_H:          44,
  TOOLBAR_H:         42,
  FOOTER_H:          28,
  BROWSER_SIDEBAR_W: 160,
  NOTE_PANEL_W:      260,

  boardW(noteOpen) {
    return window.innerWidth - (noteOpen ? this.NOTE_PANEL_W : 0);
  },

  boardH() {
    return window.innerHeight - this.HEADER_H - this.TOOLBAR_H - this.FOOTER_H;
  },
};

export { Layout };