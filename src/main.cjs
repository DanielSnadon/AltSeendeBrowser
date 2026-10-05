const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  dialog,
  Menu,
  shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { parse } = require("tldts-experimental");
const { engines, defaults, query, searchURL, address } = require("./core.cjs");
const { loadFilters, updateFilters, Request } = require("./filters.cjs");
const { snapshot, paneBounds } = require("./workspaces.cjs");
app.setName("AltSeende Browser");
app.setDesktopName("altseende-browser.desktop");
const smoke = process.argv.includes("--smoke-test");
const restartPhase = process.argv
  .find((a) => a.startsWith("--restart-smoke="))
  ?.split("=")[1];
if (restartPhase && process.env.ALTSEENDE_TEST_PROFILE)
  app.setPath("userData", process.env.ALTSEENDE_TEST_PROFILE);
if (smoke)
  app.commandLine.appendSwitch(
    "host-resolver-rules",
    "MAP altseende.test 127.0.0.1",
  );
if (smoke)
  app.setPath(
    "userData",
    path.join(app.getPath("temp"), "altseende-smoke-" + process.pid),
  );
if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
}
let win,
  settings,
  normal,
  privateSession,
  active,
  overlay = false,
  seq = 0,
  split = [],
  closing = false,
  restoring = true,
  saveTimer,
  filterState,
  speedRunning = false;
const tabs = new Map(),
  downloads = [];
let denied = 0;
const profileFile = (name) =>
  path.join(app.getPath("userData"), name + ".json");
const shellURL = pathToFileURL(path.join(__dirname, "index.html")).href;
function atomicJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
  fs.renameSync(file + ".tmp", file);
}
function save() {
  atomicJSON(profileFile("settings"), settings);
}
function persistSession() {
  clearTimeout(saveTimer);
  if (!restoring && !closing)
    atomicJSON(
      profileFile("session"),
      settings.restoreSession
        ? snapshot([...tabs.values()], active, split, settings.groups)
        : { tabs: [] },
    );
}
function panes() {
  const [w, h] = win?.getContentSize() || [1400, 900];
  return paneBounds(
    split.filter((id) => tabs.has(id) && tabs.get(id).url),
    w,
    h,
  );
}
function state() {
  return {
    tabs: [...tabs.values()].map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      private: t.private,
      group: t.group,
      error: t.error,
    })),
    active,
    overlay,
    split,
    panes: panes(),
    settings,
    engines: Object.keys(engines),
    downloads,
    denied,
    filters: { ...filterState?.info, ready: !!filterState?.engine },
    extensions: normal.extensions
      .getAllExtensions()
      .map((e) => ({ id: e.id, name: e.name, path: e.path })),
    version: process.versions.chrome,
    appVersion: app.getVersion(),
  };
}
function publish() {
  if (win && !win.isDestroyed() && !closing) {
    win.webContents.send("state", state());
    clearTimeout(saveTimer);
    if (!restoring) saveTimer = setTimeout(persistSession, 350);
  }
}
function layout() {
  if (!win || closing) return;
  const [width, height] = win.getContentSize(),
    grid = panes();
  for (const t of tabs.values()) {
    const p = grid.find((p) => p.id === t.id);
    const visible =
      !overlay && !!t.url && (split.length ? !!p : t.id === active);
    t.view.setVisible(visible);
    t.view.setBounds(
      p
        ? {
            x: p.x,
            y: p.y + 30,
            width: p.width,
            height: Math.max(0, p.height - 30),
          }
        : { x: 0, y: 58, width, height: Math.max(0, height - 110) },
    );
  }
}
function setupSession(s) {
  s.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
  s.webRequest.onBeforeRequest((d, cb) => {
    let u;
    try {
      u = new URL(d.url);
    } catch {
      return cb({});
    }
    if (
      settings.trackers &&
      filterState.engine &&
      !["mainFrame"].includes(d.resourceType)
    ) {
      const result = filterState.engine.match(
        Request.fromRawDetails({
          url: d.url,
          sourceUrl: d.referrer || d.webContents?.getURL() || "",
          type: d.resourceType,
        }),
      );
      if (result.match) {
        denied++;
        cb(
          result.redirect
            ? { redirectURL: result.redirect.dataUrl }
            : { cancel: true },
        );
        publish();
        return;
      }
    }
    if (
      settings.httpsOnly &&
      u.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    ) {
      u.protocol = "https:";
      return cb({ redirectURL: u.href });
    }
    cb({});
  });
  s.webRequest.onBeforeSendHeaders((d, cb) => {
    if (settings.dnt) {
      d.requestHeaders.DNT = "1";
      d.requestHeaders["Sec-GPC"] = "1";
    }
    cb({ requestHeaders: d.requestHeaders });
  });
  s.on("will-download", (_event, item) => {
    const d = {
      id: Date.now() + Math.random(),
      name: item.getFilename(),
      state: "progressing",
      received: 0,
      total: item.getTotalBytes(),
    };
    downloads.unshift(d);
    publish();
    item.on("updated", () => {
      d.received = item.getReceivedBytes();
      publish();
    });
    item.once("done", (_e, status) => {
      d.state = status;
      d.path = status === "completed" ? item.getSavePath() : "";
      publish();
    });
  });
}
function current() {
  return tabs.get(active);
}
function activate(id, focus = false) {
  if (!tabs.has(id)) return;
  active = id;
  overlay = false;
  if (!split.includes(id)) split = [];
  layout();
  publish();
  if (focus && tabs.get(id).url) tabs.get(id).view.webContents.focus();
}
function shortcut(wc) {
  wc.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    const match = Object.entries(settings.shortcuts).find(([, v]) => {
      const p = v.toLowerCase().split("+");
      return (
        !!i.control === p.includes("control") &&
        !!i.shift === p.includes("shift") &&
        !!i.alt === p.includes("alt") &&
        !i.meta &&
        i.key.toLowerCase() === p.at(-1)
      );
    });
    if (!match) return;
    e.preventDefault();
    const a = match[0];
    if (a === "newTab") newTab();
    else if (a === "privateTab") newTab("", true);
    else if (a === "closeTab") closeTab(active);
    else {
      if (a === "search") overlay = true;
      layout();
      win.webContents.focus();
      win.webContents.send("shortcut", a);
    }
  });
}
function newTab(url = "", priv = false, options = {}) {
  const id = ++seq;
  const view = new WebContentsView({
    webPreferences: {
      session: priv ? privateSession : normal,
      preload: path.join(__dirname, "content-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  const wc = view.webContents;
  wc.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  const t = {
    id,
    view,
    url: "",
    title: options.title || (priv ? "Private tab" : "New tab"),
    group: options.group || "",
    private: priv,
    error: "",
  };
  tabs.set(id, t);
  win.contentView.addChildView(view);
  if (!options.background) {
    active = id;
    split = [];
    overlay = false;
  }
  shortcut(wc);
  wc.on("focus", () => {
    if (active !== id && !overlay) {
      active = id;
      publish();
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) newTab(url, priv, { group: t.group });
    return { action: "deny" };
  });
  for (const ev of ["will-navigate", "will-redirect"])
    wc.on(ev, (e, url) => {
      if (!/^https?:\/\//i.test(url)) e.preventDefault();
    });
  wc.on("page-title-updated", (_e, title) => {
    t.title = title;
    publish();
  });
  for (const ev of ["did-navigate", "did-navigate-in-page"])
    wc.on(ev, (_e, url) => {
      t.url = url;
      t.error = "";
      publish();
    });
  wc.on("did-fail-load", (_e, code, description, _url, main) => {
    if (main && code !== -3) {
      t.error = description;
      publish();
    }
  });
  wc.on("render-process-gone", () => {
    t.error = "Page process stopped. Reload this tab.";
    publish();
  });
  wc.on("context-menu", (_e, p) => {
    activate(id);
    const items = [
      {
        label: "Read selected text",
        enabled: !!p.selectionText,
        click: () => speak(p.selectionText),
      },
      { label: "Copy", role: "copy" },
      { label: "Paste", role: "paste" },
    ];
    if (p.mediaType === "image")
      items.unshift(
        { label: "Save image as…", click: () => wc.downloadURL(p.srcURL) },
        { label: "Copy image", click: () => wc.copyImageAt(p.x, p.y) },
      );
    if (p.linkURL && /^https?:/.test(p.linkURL))
      items.unshift({
        label: "Open link in new tab",
        click: () => newTab(p.linkURL, priv, { group: t.group }),
      });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  if (url) navigate(url, t, false);
  layout();
  publish();
  return t;
}
function navigate(value, t = current(), focus = true) {
  if (!t) return;
  const url = address(value, settings);
  t.url = url;
  t.error = "";
  overlay = false;
  layout();
  publish();
  if (focus) {
    win.webContents.send("navigating", { id: t.id, url });
    t.view.webContents.focus();
  }
  t.view.webContents.loadURL(url).catch((e) => {
    if (t.view.webContents && !t.view.webContents.isDestroyed()) {
      t.error = e.message;
      publish();
    }
  });
}
function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  win.contentView.removeChildView(t.view);
  tabs.delete(id);
  split = split.filter((x) => x !== id);
  if (split.length < 2) split = [];
  t.view.webContents.close();
  if (active === id) active = split[0] || [...tabs.keys()].at(-1);
  if (!tabs.size) newTab();
  layout();
  publish();
}
function setSplit(ids) {
  const selected = [...new Set(ids)]
    .filter((id) => tabs.has(id) && tabs.get(id).url)
    .slice(0, 6);
  if (selected.length && selected.length < 2)
    throw Error("Choose at least two tabs with open pages.");
  split = selected;
  if (split.length) active = split[0];
  overlay = false;
  layout();
  publish();
}
function speak(text) {
  overlay = true;
  layout();
  win.webContents.send("reader", text);
}
function newGroup(name) {
  name = String(name || "")
    .trim()
    .slice(0, 60);
  if (!name) throw Error("Enter a group name.");
  const group = {
    id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    color: ["#b9c9b1", "#b3c8da", "#d2b8cf", "#d6c49e"][
      settings.groups.length % 4
    ],
  };
  settings.groups.push(group);
  save();
  return group.id;
}
function checkedURLs(urls) {
  if (!Array.isArray(urls) || !urls.length || urls.length > 30)
    throw Error("Enter between 1 and 30 page URLs.");
  return urls.map((u) => {
    const url = new URL(u.trim());
    if (!["http:", "https:"].includes(url.protocol))
      throw Error("Presets require HTTP(S) URLs.");
    return url.href;
  });
}
async function screenshot() {
  const t = current();
  if (!t?.url) throw Error("Open a page first.");
  const image = await t.view.webContents.capturePage();
  const r = await dialog.showSaveDialog(win, {
    title: "Save page screenshot",
    defaultPath: path.join(
      app.getPath("pictures"),
      `AltSeende-${Date.now()}.png`,
    ),
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (!r.canceled && r.filePath) {
    fs.writeFileSync(r.filePath, image.toPNG());
    return "Screenshot saved.";
  }
  return "Screenshot cancelled.";
}
async function speedTest() {
  if (speedRunning) throw Error("A speed test is already running.");
  speedRunning = true;
  try {
    const start = performance.now();
    const ping = await fetch("https://speed.cloudflare.com/__down?bytes=0", {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!ping.ok) throw Error("Speed server unavailable.");
    await ping.arrayBuffer();
    const latency = performance.now() - start;
    const begun = performance.now(),
      response = await fetch(
        "https://speed.cloudflare.com/__down?bytes=8000000",
        { signal: AbortSignal.timeout(45000), cache: "no-store" },
      );
    if (!response.ok) throw Error("Speed server unavailable.");
    const bytes = (await response.arrayBuffer()).byteLength;
    return {
      latency: Math.round(latency),
      mbps: Number(
        ((bytes * 8) / ((performance.now() - begun) / 1000) / 1e6).toFixed(1),
      ),
      bytes,
    };
  } finally {
    speedRunning = false;
  }
}
ipcMain.handle("cosmetic-filters", (event, data) => {
  if (
    ![...tabs.values()].some((t) => t.view.webContents === event.sender) ||
    !settings.trackers ||
    !filterState.engine
  )
    return "";
  const url = event.senderFrame?.url;
  if (!url || !/^https?:/.test(url)) return "";
  const host = parse(url);
  const clean = (a) =>
    Array.isArray(a)
      ? a.filter((v) => typeof v === "string" && v.length < 200).slice(0, 8000)
      : [];
  return (
    filterState.engine.getCosmeticsFilters({
      url,
      hostname: host.hostname || "",
      domain: host.domain,
      classes: clean(data?.classes),
      ids: clean(data?.ids),
      getBaseRules: true,
      getRulesFromDOM: true,
      getRulesFromHostname: true,
      getInjectionRules: false,
      getExtendedRules: false,
    }).styles || ""
  );
});
async function command(action, data) {
  switch (action) {
    case "state":
      return state();
    case "new":
      newTab("", !!data);
      break;
    case "activate":
      activate(data, true);
      break;
    case "close":
      closeTab(data);
      break;
    case "navigate":
      navigate(data);
      break;
    case "back":
      if (current()?.view.webContents.navigationHistory.canGoBack())
        current().view.webContents.navigationHistory.goBack();
      break;
    case "forward":
      if (current()?.view.webContents.navigationHistory.canGoForward())
        current().view.webContents.navigationHistory.goForward();
      break;
    case "reload":
      current()?.view.webContents.reload();
      break;
    case "overlay":
      overlay = !!data;
      layout();
      break;
    case "split":
      setSplit(data);
      break;
    case "search": {
      const q = query(data);
      if (!q) throw Error("Enter a query or search filter.");
      const selected = data.engines.filter((e) => engines[e]);
      if (!selected.length) throw Error("Choose at least one engine.");
      const priv = current()?.private,
        group = priv ? "" : newGroup(q.slice(0, 40)),
        ids = selected.map((e) => newTab(searchURL(q, e), priv, { group }).id);
      if (data.split && ids.length > 1) setSplit(ids);
      break;
    }
    case "group": {
      const ids = data.ids.filter((id) => tabs.has(id));
      const group = data.create ? newGroup(data.name) : data.group;
      if (group && !settings.groups.some((g) => g.id === group))
        throw Error("Unknown group.");
      ids.forEach((id) => (tabs.get(id).group = group));
      save();
      publish();
      break;
    }
    case "renameGroup": {
      const group = settings.groups.find((g) => g.id === data.id);
      if (group && String(data.name).trim()) {
        group.name = String(data.name).trim().slice(0, 60);
        save();
        publish();
      }
      break;
    }
    case "deleteGroup":
      settings.groups = settings.groups.filter((g) => g.id !== data);
      for (const t of tabs.values()) if (t.group === data) t.group = "";
      save();
      publish();
      break;
    case "presetSave": {
      const name = String(data.name || "")
        .trim()
        .slice(0, 60);
      if (!name) throw Error("Name this preset.");
      const urls = checkedURLs(data.urls);
      const preset = {
        id: data.id || "p" + Date.now().toString(36),
        name,
        urls,
        split: !!data.split,
      };
      const at = settings.presets.findIndex((p) => p.id === preset.id);
      if (at < 0) settings.presets.push(preset);
      else settings.presets[at] = preset;
      save();
      publish();
      break;
    }
    case "presetDelete":
      settings.presets = settings.presets.filter((p) => p.id !== data);
      save();
      publish();
      break;
    case "presetOpen": {
      const p = settings.presets.find((p) => p.id === data);
      if (!p) throw Error("Preset not found.");
      const group = newGroup(p.name),
        ids = checkedURLs(p.urls).map(
          (url) => newTab(url, false, { group }).id,
        );
      if (p.split && ids.length > 1) setSplit(ids);
      break;
    }
    case "settings": {
      const next = { ...settings };
      for (const k of [
        "trackers",
        "dnt",
        "httpsOnly",
        "restoreSession",
        "splitSearch",
        "showPresets",
      ])
        if (typeof data[k] === "boolean") next[k] = data[k];
      if (engines[data.engine]) next.engine = data.engine;
      if (/^#[a-f0-9]{6}$/i.test(data.accent || "")) next.accent = data.accent;
      if (["comfortable", "compact"].includes(data.density))
        next.density = data.density;
      if (["mono", "sans"].includes(data.font)) next.font = data.font;
      if (typeof data.homeTitle === "string")
        next.homeTitle = data.homeTitle.slice(0, 80);
      if (Array.isArray(data.tools))
        next.tools = [...new Set(data.tools)].filter((t) =>
          [
            "search",
            "split",
            "downloads",
            "screenshot",
            "speed",
            "reader",
            "groups",
            "home",
            "private",
          ].includes(t),
        );
      if (data.shortcuts) {
        const vals = Object.values(data.shortcuts);
        if (
          vals.length !== 5 ||
          new Set(vals).size !== 5 ||
          vals.some(
            (x) => !/^(Control\+)(Shift\+)?(Alt\+)?[A-Za-z0-9]$/.test(x),
          )
        )
          throw Error("Use unique shortcuts such as Control+Shift+F.");
        for (const k of Object.keys(defaults.shortcuts))
          if (typeof data.shortcuts[k] !== "string")
            throw Error("Missing shortcut");
        next.shortcuts = data.shortcuts;
      }
      const changedBlocking = next.trackers !== settings.trackers;
      settings = next;
      save();
      persistSession();
      if (changedBlocking)
        for (const t of tabs.values()) if (t.url) t.view.webContents.reload();
      publish();
      break;
    }
    case "filtersUpdate":
      filterState = await updateFilters(
        path.join(app.getPath("userData"), "filters"),
      );
      publish();
      return "Filter lists updated. Reload pages to apply cosmetic changes.";
    case "clear":
      await Promise.all([
        normal.clearStorageData(),
        normal.clearCache(),
        privateSession.clearStorageData(),
        privateSession.clearCache(),
      ]);
      return "Cookies, storage and cache cleared.";
    case "read": {
      if (!current()?.url)
        throw Error("Open a page first, or paste text in Reader.");
      speak(
        await current().view.webContents.executeJavaScript(
          "String(window.getSelection()) || document.body.innerText.slice(0,100000)",
        ),
      );
      break;
    }
    case "media": {
      if (!current()?.url) return [];
      return current().view.webContents.executeJavaScript(
        "Array.from(document.querySelectorAll('video,video source,a[href]')).map(e=>e.currentSrc||e.src||e.href).filter(u=>u&&/^https?:/.test(u)&&/\\.(mp4|webm|ogg|mov)([?#]|$)/i.test(u)).filter((u,i,a)=>a.indexOf(u)===i).slice(0,100)",
      );
    }
    case "download": {
      const u = new URL(data);
      if (!["https:", "http:"].includes(u.protocol))
        throw Error("A direct HTTP(S) media URL is required.");
      current().view.webContents.downloadURL(u.href);
      break;
    }
    case "showDownload": {
      const d = downloads.find((d) => d.id === data && d.path);
      if (d) shell.showItemInFolder(d.path);
      break;
    }
    case "screenshot":
      return screenshot();
    case "speed":
      return speedTest();
    case "extension": {
      const r = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        title: "Select unpacked Chrome extension",
      });
      if (!r.canceled) {
        const ext = await normal.extensions.loadExtension(r.filePaths[0]);
        settings.extensions = [...new Set([...settings.extensions, ext.path])];
        save();
        publish();
      }
      break;
    }
    case "removeExtension": {
      const ext = normal.extensions.getExtension(data);
      if (ext) {
        normal.extensions.removeExtension(data);
        settings.extensions = settings.extensions.filter((p) => p !== ext.path);
        save();
        publish();
      }
      break;
    }
    default:
      throw Error("Unknown command");
  }
  return state();
}
ipcMain.handle("command", (event, action, data) => {
  if (
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    event.senderFrame.url !== shellURL
  )
    throw Error("Untrusted sender");
  return command(action, data);
});
function restoreSession(saved) {
  if (!settings.restoreSession || !Array.isArray(saved?.tabs)) return;
  const mapping = new Map();
  for (const t of saved.tabs.slice(0, 100)) {
    if (t.private || (t.url && !/^https?:\/\//.test(t.url))) continue;
    const tab = newTab(t.url || "", false, {
      title: t.title,
      group: settings.groups.some((g) => g.id === t.group) ? t.group : "",
      background: true,
    });
    mapping.set(t.id, tab.id);
  }
  active = mapping.get(saved.active) || [...tabs.keys()][0];
  split = (saved.split || [])
    .map((id) => mapping.get(id))
    .filter((id) => tabs.get(id)?.url)
    .slice(0, 6);
  if (split.length < 2) split = [];
}
app.whenReady().then(async () => {
  settings = structuredClone(defaults);
  try {
    const loaded = JSON.parse(fs.readFileSync(profileFile("settings"), "utf8"));
    settings = {
      ...settings,
      ...loaded,
      shortcuts: { ...settings.shortcuts, ...loaded.shortcuts },
    };
  } catch {}
  filterState = loadFilters([
    path.join(app.getPath("userData"), "filters"),
    path.join(__dirname, "../assets/filters"),
  ]);
  normal = session.fromPartition("persist:altseende");
  privateSession = session.fromPartition("altseende-private");
  setupSession(normal);
  setupSession(privateSession);
  for (const p of settings.extensions)
    try {
      await normal.extensions.loadExtension(p);
    } catch (e) {
      console.error("Extension not loaded:", e.message);
    }
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#090a0b",
    title: "AltSeende Browser",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  shortcut(win.webContents);
  win.on("resize", () => {
    layout();
    publish();
  });
  win.on("close", () => {
    persistSession();
    closing = true;
    clearTimeout(saveTimer);
  });
  win.on("closed", () => {
    for (const t of tabs.values()) t.view.webContents.close();
    tabs.clear();
    win = null;
  });
  app.on("second-instance", () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  await win.loadFile(path.join(__dirname, "index.html"));
  try {
    restoreSession(JSON.parse(fs.readFileSync(profileFile("session"), "utf8")));
  } catch {}
  if (!tabs.size) newTab();
  restoring = false;
  layout();
  publish();
  if (!filterState.engine)
    updateFilters(path.join(app.getPath("userData"), "filters"))
      .then((f) => {
        filterState = f;
        publish();
      })
      .catch((e) => console.error("Filters unavailable:", e.message));
  if (restartPhase)
    require("./restart-smoke.cjs")({
      phase: restartPhase,
      app,
      state,
      newTab,
      command,
    });
  if (smoke)
    require("./smoke.cjs")({
      app,
      win,
      newTab,
      tabs,
      current,
      normal,
      privateSession,
      closeTab,
      state,
      command,
      persistSession,
      restoreSession,
      profileFile,
    });
});
app.on("window-all-closed", () => app.quit());
