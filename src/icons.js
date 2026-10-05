const iconPaths = {
  audio: "M4 9h4l5-5v16l-5-5H4zM17 8q5 4 0 8",
  muted: "M4 9h4l5-5v16l-5-5H4zM17 9l5 6M17 15l5-6",
  bookmarks: "M6 3h12v19l-6-4-6 4z",
  find: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  zoom: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6M6 10h8M10 6v8",
  fullscreen: "M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6",
  pdf: "M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7",
  print: "M7 8V3h10v5M5 18H3V8h18v10h-2M7 14h10v8H7zM17 11h1",
  copyLink:
    "M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",

  back: "M15 5l-7 7 7 7",
  forward: "M9 5l7 7-7 7",
  reload: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
  search: "M9 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12M14 14l6 6M17 3h4M19 1v4",
  split: "M3 4h18v16H3zM12 4v16",
  downloads: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  screenshot: "M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0",
  speed: "M4 18a9 9 0 1 1 16 0M12 14l5-6M6 18h12",
  reader: "M4 9h4l5-5v16l-5-5H4zM17 8q5 4 0 8M20 5q7 7 0 14",
  groups: "M3 6h7l2 3h9v11H3zM3 6V3h8l2 3h8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  close: "M6 6l12 12M6 18 18 6",
  plus: "M12 4v16M4 12h16",
  home: "M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7",
  private: "M3 7h18v10H3zM7 11h3m4 0h3M10 14h4",
  shield: "M12 2l8 4v6q0 6-8 10-8-4-8-10V6zM8 12l3 3 5-6",
  play: "M7 3l14 9-14 9z",
  pause: "M8 4v16M16 4v16",
  stop: "M5 5h14v14H5z",
  save: "M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  edit: "M4 16l12-12 4 4L8 20H4zM13 7l4 4",
  up: "M5 14l7-7 7 7",
  down: "M5 10l7 7 7-7",
  check: "M4 12l5 5L20 6",
  external: "M14 3h7v7M21 3l-12 12M10 3H3v18h18v-7",
};
function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.5");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(s.namespaceURI, "path");
  p.setAttribute("d", iconPaths[name] || iconPaths.settings);
  s.append(p);
  return s;
}
