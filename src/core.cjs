const engines = {
  Yahoo: "https://search.yahoo.com/search?p=",
  DuckDuckGo: "https://duckduckgo.com/?q=",
  Google: "https://www.google.com/search?q=",
  Yandex: "https://yandex.com/search/?text=",
  Bing: "https://www.bing.com/search?q=",
  Brave: "https://search.brave.com/search?q=",
};
const defaults = {
  engine: "DuckDuckGo",
  trackers: true,
  dnt: true,
  httpsOnly: true,
  accent: "#d0d0d0",
  density: "comfortable",
  font: "mono",
  shortcuts: {
    newTab: "Control+T",
    closeTab: "Control+W",
    address: "Control+L",
    search: "Control+Shift+F",
    privateTab: "Control+Shift+N",
  },
  extensions: [],
  restoreSession: true,
  splitSearch: true,
  homeTitle: "Start here.",
  showPresets: true,
  tools: [
    "search",
    "split",
    "downloads",
    "screenshot",
    "audio",
    "bookmarks",
    "network",
    "qr",
    "dark",
  ],
  presets: [
    {
      id: "research",
      name: "Research",
      urls: [
        "https://www.google.com/",
        "https://yandex.com/",
        "https://duckduckgo.com/",
      ],
      split: true,
    },
  ],
  groups: [],
  bookmarks: [],
  motion: true,
  designVersion: 4,
  splitColumns: 0,
  darkSites: [],
  readingList: [],
  notes: {},
  networkGuard: false,
};
function query(o) {
  return [
    String(o.text || "").trim(),
    o.exact ? '"' + String(o.exact).replaceAll('"', "") + '"' : "",
    ...String(o.exclude || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => "-" + x.replace(/^-/, "")),
    o.site ? "site:" + String(o.site).replace(/[^a-zA-Z0-9.\-]/g, "") : "",
    o.type && /^[a-z0-9]+$/i.test(o.type) ? "filetype:" + o.type : "",
    /^\d{4}-\d{2}-\d{2}$/.test(o.after || "") ? "after:" + o.after : "",
  ]
    .filter(Boolean)
    .join(" ");
}
function searchURL(q, engine) {
  return (engines[engine] || engines.DuckDuckGo) + encodeURIComponent(q);
}
function address(text, settings = defaults) {
  text = String(text).trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[\w.-]+:\d+(\/|$)/.test(text)) {
    const u = new URL(text);
    if (!["http:", "https:"].includes(u.protocol))
      throw Error("Only HTTP and HTTPS addresses are allowed.");
    if (
      settings.httpsOnly &&
      u.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
      u.protocol = "https:";
    return u.href;
  }
  if (
    !/\s/.test(text) &&
    /^(localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?([/?#]|$)/.test(text)
  )
    return address(
      (text.startsWith("localhost") ? "http://" : "https://") + text,
      settings,
    );
  return searchURL(text, settings.engine);
}
function blocked(host) {
  return [
    "doubleclick.net",
    "google-analytics.com",
    "googlesyndication.com",
    "facebook.net",
    "hotjar.com",
    "clarity.ms",
  ].some((d) => host === d || host.endsWith("." + d));
}
module.exports = { engines, defaults, query, searchURL, address, blocked };
