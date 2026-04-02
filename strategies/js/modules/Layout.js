const Layout = {
  HEADER_H:    44,
  TOOLBAR_H:   42,
  FOOTER_H:    28,
  NOTE_W:      260,
  NOTATION_W:  300,
  LIB_SIDE_W:  180,

  boardW: (noteOpen, notationOpen) =>
    window.innerWidth - (noteOpen ? Layout.NOTE_W : 0) - (notationOpen ? Layout.NOTATION_W : 0),
  boardH: () => window.innerHeight - Layout.HEADER_H - Layout.TOOLBAR_H - Layout.FOOTER_H,
};

export { Layout };