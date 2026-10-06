const $ = (s) => document.querySelector(s);
let state,
  panel = "",
  toastTimer,
  addressDirty = false,
  renderedActive,
  renderedURL,
  homeKey = "",
  toolsKey = "",
  seenTabs = new Set(),
  paneKey = "";
const toolNames = {
  control: "Control center",
  network: "VPN & connection",
  vault: "Passwords",
  portal: "Network sign-in",
  qr: "Page QR",
  dark: "Dark websites",
  history: "History",
  reading: "Read later",
  notes: "Page notes",
  tabSearch: "Find a tab",
  reopen: "Reopen closed tab",
  duplicate: "Duplicate tab",
  pin: "Pin tab",
  cleanLink: "Copy clean link",
  search: "Multi-search",
  split: "Split view",
  downloads: "Videos & downloads",
  screenshot: "Save screenshot",
  speed: "Connection speed",
  reader: "Read aloud",
  groups: "Tabs & groups",
  home: "Home",
  private: "Private tab",
  audio: "Tab audio mixer",
  bookmarks: "Bookmarks",
  find: "Find on page",
  zoom: "Page zoom",
  fullscreen: "Fullscreen",
  pdf: "Save PDF",
  print: "Print page",
  copyLink: "Copy page address",
};
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
async function call(a, d) {
  try {
    return await window.alt.command(a, d);
  } catch (e) {
    toast(e.message.replace(/^Error invoking remote method.*?Error: /, ""));
    return null;
  }
}
function button(title, fn, name = "check", cls = "") {
  const e = el("button", undefined, cls);
  e.type = "button";
  e.title = title;
  e.setAttribute("aria-label", title);
  e.append(icon(name));
  e.onclick = fn;
  return e;
}
function label(text, control, cls) {
  const l = el("label", text, cls);
  l.append(control);
  return l;
}
function input(name, placeholder = "", value = "") {
  const e = el("input");
  e.name = name;
  e.placeholder = placeholder;
  e.value = value;
  return e;
}
function checkbox(name, checked) {
  const e = input(name);
  e.type = "checkbox";
  e.checked = checked;
  return e;
}
function select(name, values, value) {
  const e = el("select");
  e.name = name;
  for (const v of values) {
    const o = el("option", typeof v === "string" ? v : v.name);
    o.value = typeof v === "string" ? v : v.id;
    e.append(o);
  }
  e.value = value;
  return e;
}
function note(text) {
  return el("p", text, "note");
}
function submit(form, title = "Save", name = "save") {
  const b = button(title, undefined, name, "primary");
  b.type = "submit";
  form.append(b);
}
function actionTool(name) {
  if (name === "split") return call("quickSplit");
  if (
    ["dark", "portal", "reopen", "duplicate", "pin", "cleanLink"].includes(name)
  )
    return call(name).then((r) => typeof r === "string" && toast(r));
  if (["screenshot", "pdf", "print", "copyLink"].includes(name))
    call(name).then((r) => r && toast(r));
  else if (name === "fullscreen") call("fullscreen");
  else if (name === "find") openFind();
  else if (name === "home") call("new");
  else if (name === "private") call("new", true);
  else showPanel(name);
}
function render(s) {
  state = s;
  document.body.classList.toggle("no-motion", !s.settings.motion);
  document.body.classList.toggle("has-panel", !!s.overlay);
  if (!s.overlay && panel) {
    panel = "";
    $("#panel").hidden = true;
  }
  document.documentElement.style.setProperty("--accent", s.settings.accent);
  document.body.classList.toggle("compact", s.settings.density === "compact");
  document.body.classList.toggle("mono", s.settings.font === "mono");
  const t = s.tabs.find((t) => t.id === s.active);
  if (s.active !== renderedActive || t?.url !== renderedURL || !addressDirty) {
    $("#address").value = t?.url || "";
    addressDirty = false;
  }
  renderedActive = s.active;
  renderedURL = t?.url;
  $("#address").title = t?.url || "Page address or search";
  $("#home").hidden = !!t?.url;
  $("#home-status").textContent = t?.private
    ? "Private session · these tabs will not be restored."
    : s.settings.restoreSession
      ? "Your tabs will be here when you return."
      : "Session restore is off.";
  $("#blocker").classList.toggle("enabled", s.settings.trackers);
  $("#blocker").title =
    `Ad blocker ${s.settings.trackers ? "on" : "off"} · ${s.denied} blocked requests`;
  const tk = JSON.stringify(s.settings.tools);
  if (tk !== toolsKey) {
    toolsKey = tk;
    $("#tools").replaceChildren(
      ...s.settings.tools.map((n) =>
        Object.assign(
          button(toolNames[n], () => actionTool(n), n),
          { id: "tool-" + n },
        ),
      ),
    );
  }
  if ($("#tool-network")) {
    $("#tool-network").classList.toggle("active", s.network?.mode !== "direct");
    $("#tool-network").title =
      "VPN & connection · " + (s.network?.mode || "direct");
  }
  const hk = JSON.stringify([
    s.settings.presets,
    s.settings.homeTitle,
    s.settings.showPresets,
  ]);
  if (hk !== homeKey) {
    homeKey = hk;
    $("#home-title").textContent = s.settings.homeTitle || "Start here.";
    $("#presets-section").hidden = !s.settings.showPresets;
    $("#presets").replaceChildren();
    for (const p of s.settings.presets) {
      const b = button(
        "Open " + p.name,
        () => call("presetOpen", p.id),
        "groups",
        "preset",
      );
      const text = el("div");
      text.append(
        el("strong", p.name),
        el(
          "small",
          `${p.urls.length} pages${p.split ? " · side by side" : ""}`,
        ),
      );
      b.append(text);
      $("#presets").append(b);
    }
    const add = button(
      "Create a tab preset",
      () => showPanel("home"),
      "plus",
      "preset",
    );
    const txt = el("div");
    txt.append(el("strong", "New space"), el("small", "Save a set of pages"));
    add.append(txt);
    $("#presets").append(add);
  }
  if (!$("#home-engine").options.length)
    for (const e of s.engines) $("#home-engine").append(new Option(e, e));
  if (document.activeElement !== $("#home-engine"))
    $("#home-engine").value = s.settings.engine;
  $("#tabs").replaceChildren();
  let lastGroup = null;
  const groups = [...new Set(s.tabs.map((t) => t.group))];
  const ordered = [
    ...s.tabs.filter((t) => t.pinned),
    ...groups.flatMap((g) => s.tabs.filter((t) => t.group === g && !t.pinned)),
  ];
  for (const t of ordered) {
    if (t.group && t.group !== lastGroup) {
      const g = s.settings.groups.find((g) => g.id === t.group);
      if (g) {
        const text = el("span", g.name, "group-label");
        text.style.borderColor = g.color;
        text.title = "Manage group: " + g.name;
        text.onclick = () => showPanel("groups");
        $("#tabs").append(text);
      }
    }
    lastGroup = t.group;
    const box = el(
      "div",
      undefined,
      `tab${t.id === s.active ? " active" : ""}${s.split.includes(t.id) ? " in-split" : ""}`,
    );
    const b = el(
      "button",
      (t.pinned ? "• " : "") + (t.private ? "◈ " : "") + t.title,
    );
    b.title = t.url || t.title;
    b.onclick = async () => {
      await hidePanel();
      await call("activate", t.id);
    };
    if (!seenTabs.has(t.id)) box.classList.add("arriving");
    seenTabs.add(t.id);
    box.append(
      b,
      button(
        `Volume · ${Math.round(t.volume * 100)}%${t.muted ? " · muted" : ""}`,
        () => showAudio(t.id),
        t.muted || t.volume === 0 ? "muted" : "audio",
        "tab-audio",
      ),
      button("Close " + t.title, () => call("close", t.id), "close"),
    );
    $("#tabs").append(box);
  }
  $("#tab-count").textContent = s.tabs.length;
  const nextPaneKey = s.split.join(",");
  const changedPanes = paneKey !== nextPaneKey;
  paneKey = nextPaneKey;
  $("#pane-headers").replaceChildren();
  for (const p of s.panes) {
    const tab = s.tabs.find((t) => t.id === p.id),
      h = el(
        "div",
        undefined,
        "pane-heading" + (p.id === s.active ? " active" : ""),
      );
    Object.assign(h.style, {
      left: p.x + "px",
      top: p.y + "px",
      width: p.width + "px",
    });
    if (changedPanes) h.classList.add("arriving");
    const url = el("span", tab.url, "pane-url");
    url.title = tab.url;
    url.onclick = () => call("activate", p.id);
    h.append(
      url,
      button(
        "Tab volume",
        () => showAudio(tab.id),
        tab.muted || tab.volume === 0 ? "muted" : "audio",
      ),
      button(
        "Show only this tab",
        async () => {
          await call("split", []);
          await call("activate", p.id);
        },
        "external",
      ),
      button("Close this tab", () => call("close", p.id), "close"),
    );
    $("#pane-headers").append(h);
  }
  $("#error").hidden = !t?.error || !!panel;
  $("#error").textContent = t?.error || "";
  if (panel === "downloads") downloadList();
}
window.alt.onState(render);
window.alt.onNavigate(({ id, url }) => {
  if (state?.active === id) {
    addressDirty = false;
    $("#address").value = url;
    $("#address").blur();
  }
});
window.alt.onShortcut((a) => {
  if (a === "address") {
    $("#address").focus();
    $("#address").select();
  } else if (a === "find") openFind();
  else showPanel("search");
});
window.alt.onReader(async (t) => {
  await showPanel("reader");
  $("#reader-text").value = t;
});
async function hidePanel() {
  panel = "";
  $("#panel").hidden = true;
  const s = await call("overlay", false);
  if (s) render(s);
}
async function showPanel(name) {
  panel = name;
  const s = await call("overlay", true);
  if (s) state = s;
  document.body.classList.add("has-panel");
  $("#home").hidden = !!state.tabs.find((t) => t.id === state.active)?.url;
  $("#error").hidden = true;
  $("#panel").hidden = false;
  $("#panel-title").textContent =
    {
      search: "Search across the web",
      settings: "Preferences",
      reader: "Read aloud",
      downloads: "Videos & downloads",
      split: "Arrange your view",
      groups: "Tabs & groups",
      home: "Your home, your spaces",
      speed: "Connection speed",
      audio: "Tab audio",
      bookmarks: "Saved pages",
      zoom: "Page zoom",
    }[name] || toolNames[name];
  const body = $("#panel-body");
  body.replaceChildren();
  animateIn($("#panel"));
  if (name === "control") controlPanel(body);
  else if (name === "network") networkPanel(body);
  else if (name === "vault") vaultPanel(body);
  else if (name === "qr") qrPanel(body);
  else if (["history", "reading", "tabSearch"].includes(name))
    libraryPanel(body, name);
  else if (name === "notes") notesPanel(body);
  else if (name === "search") searchPanel(body);
  else if (name === "settings") settingsPanel(body);
  else if (name === "split" || name === "groups") tabsPanel(body, name);
  else if (name === "home") homePanel(body);
  else if (name === "reader") readerPanel(body);
  else if (name === "downloads") downloadsPanel(body);
  else if (name === "speed") speedPanel(body);
  else if (name === "audio") audioPanel(body);
  else if (name === "bookmarks") bookmarksPanel(body);
  else if (name === "zoom") zoomPanel(body);
}
function searchPanel(body) {
  const form = el("form"),
    grid = el("div", undefined, "grid");
  for (const [n, t, p] of [
    ["text", "Query", "What are you looking for?"],
    ["exact", "Exact phrase", "These words, together"],
    ["exclude", "Exclude words", "ads spam"],
    ["site", "Limit to domain", "example.com"],
    ["type", "File type", "pdf"],
    ["after", "Published after", "YYYY-MM-DD"],
  ]) {
    const i = input(n, p);
    if (n === "after") i.type = "date";
    grid.append(label(t, i));
  }
  form.append(grid);
  const row = el("div", undefined, "engine-list");
  for (const e of state.engines) {
    const i = checkbox("engine", true);
    i.value = e;
    row.append(label(e, i, "check"));
  }
  form.append(
    row,
    label("Open results side by side", checkbox("split", true), "check"),
    note(
      "Selected engines open in one group. Each provider interprets advanced search operators differently.",
    ),
  );
  submit(form, "Search all six engines · 3 × 2", "search");
  const custom = button(
    "Search checked engines",
    () => perform(false),
    "check",
  );
  form.append(custom, el("span", "6 engines · 3 × 2", "search-summary"));
  async function perform(all) {
    const d = Object.fromEntries(new FormData(form));
    d.engines = [...form.querySelectorAll("[name=engine]:checked")].map(
      (i) => i.value,
    );
    d.all = all;
    d.split = all || form.elements.split.checked;
    const result = await call("search", d);
    if (result) {
      await hidePanel();
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    perform(true);
  };
  body.append(form);
  form.elements.text.focus();
}
function tabsPanel(body, name) {
  const form = el("form"),
    list = el("div", undefined, "split-list");
  body.append(
    note(
      name === "split"
        ? "Choose 2–6 pages to keep visible together. Click any page or its address to make it active."
        : "Select tabs to group them. Groups and regular tabs are restored on the next launch.",
    ),
  );
  for (const t of state.tabs) {
    const c = checkbox("tab", name === "split" && state.split.includes(t.id));
    c.value = t.id;
    if (name === "split" && !t.url) c.disabled = true;
    const l = el("label");
    l.append(
      c,
      el("span", `${t.private ? "◈ " : ""}${t.title}  ${t.url || "New tab"}`),
    );
    list.append(l);
  }
  form.append(list);
  const chosen = () =>
    [...form.querySelectorAll("[name=tab]:checked")].map((i) =>
      Number(i.value),
    );
  if (name === "split") {
    submit(form, "Apply split view", "split");
    form.append(
      button(
        "Return to single page",
        async () => {
          await call("split", []);
          hidePanel();
        },
        "external",
      ),
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (chosen().length < 2) return toast("Select at least two pages.");
      if (chosen().length > 6) return toast("Select up to six pages.");
      if (await call("split", chosen())) hidePanel();
    };
  } else {
    const row = el("div", undefined, "row"),
      group = select(
        "group",
        [{ id: "", name: "Ungrouped" }, ...state.settings.groups],
        "",
      ),
      title = input("name", "New group name");
    row.append(
      group,
      button(
        "Move selected tabs to group",
        async () => {
          if (!chosen().length) return toast("Select tabs first.");
          if (await call("group", { ids: chosen(), group: group.value }))
            showPanel("groups");
        },
        "groups",
      ),
    );
    const create = el("div", undefined, "row");
    create.append(
      title,
      button(
        "Create group from selected tabs",
        async () => {
          if (!chosen().length) return toast("Select tabs first.");
          if (
            await call("group", {
              ids: chosen(),
              create: true,
              name: title.value,
            })
          )
            showPanel("groups");
        },
        "plus",
      ),
    );
    form.append(row, create);
    for (const g of state.settings.groups) {
      const row = el("div", undefined, "row"),
        n = input("groupName", "", g.name);
      row.append(
        n,
        button(
          "Rename group",
          async () => {
            await call("renameGroup", { id: g.id, name: n.value });
            showPanel("groups");
          },
          "save",
        ),
        button(
          "Ungroup tabs and remove group",
          async () => {
            await call("deleteGroup", g.id);
            showPanel("groups");
          },
          "trash",
        ),
        button(
          "Open this group side by side",
          async () => {
            if (
              await call(
                "split",
                state.tabs.filter((t) => t.group === g.id).map((t) => t.id),
              )
            )
              hidePanel();
          },
          "split",
        ),
      );
      form.append(row);
    }
    form.onsubmit = (e) => e.preventDefault();
  }
  body.append(form);
}
function settingsPanel(body) {
  const s = state.settings,
    launcher = el("div", undefined, "toolbar-preview");
  for (const n of Object.keys(toolNames))
    launcher.append(button(toolNames[n], () => actionTool(n), n));
  launcher.append(
    button("Customize home & presets", () => showPanel("home"), "edit"),
  );
  body.append(launcher);
  const form = el("form"),
    grid = el("div", undefined, "grid");
  grid.append(
    label("Default search", select("engine", state.engines, s.engine)),
    label("Density", select("density", ["comfortable", "compact"], s.density)),
    label("Typeface", select("font", ["mono", "sans"], s.font)),
  );
  const color = input("accent", "", s.accent);
  color.type = "color";
  grid.append(label("Accent", color));
  form.append(el("h3", "Appearance"), grid, el("h3", "Browsing"));
  for (const [k, text] of [
    ["motion", "Smooth interface animations"],
    ["restoreSession", "Restore regular tabs and groups at startup"],
    ["splitSearch", "Show multi-search results side by side"],
    ["trackers", "Block ads and trackers"],
    ["httpsOnly", "Upgrade remote HTTP requests to HTTPS"],
    ["dnt", "Send Do Not Track and Global Privacy Control"],
  ])
    form.append(label(text, checkbox(k, s[k]), "check row"));
  form.append(
    note(
      state.filters.ready
        ? `Filters: EasyList, EasyPrivacy, RU AdList · updated ${new Date(state.filters.updated).toLocaleDateString()}. Includes network blocking and cosmetic hiding. No blocker can remove every ad on every site.`
        : "Filters are not available yet. Download them using the refresh button.",
    ),
  );
  form.append(
    button(
      "Update ad-blocking filters",
      async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        const result = await call("filtersUpdate");
        b.disabled = false;
        if (result) toast(result);
      },
      "reload",
    ),
    button(
      "Clear cookies, storage and cache",
      async () => {
        const r = await call("clear");
        if (typeof r === "string") toast(r);
      },
      "trash",
    ),
  );
  form.append(
    note(
      "Changing ad blocking reloads open pages. Private tabs are never restored. Site permission requests are denied by default.",
    ),
  );
  form.append(el("h3", "Toolbar — select and arrange"));
  let order = [
    ...s.tools,
    ...Object.keys(toolNames).filter((n) => !s.tools.includes(n)),
  ];
  const enabled = new Set(s.tools),
    toolRows = el("div");
  function drawTools() {
    toolRows.replaceChildren();
    order.forEach((n, i) => {
      const row = el("div", undefined, "tool-row"),
        c = checkbox("tool", enabled.has(n));
      c.onchange = () => (c.checked ? enabled.add(n) : enabled.delete(n));
      row.append(
        icon(n),
        label(toolNames[n], c, "check"),
        button(
          "Move up",
          () => {
            if (i) {
              [order[i - 1], order[i]] = [order[i], order[i - 1]];
              drawTools();
            }
          },
          "up",
        ),
        button(
          "Move down",
          () => {
            if (i < order.length - 1) {
              [order[i + 1], order[i]] = [order[i], order[i + 1]];
              drawTools();
            }
          },
          "down",
        ),
      );
      row.firstChild.style.width = "18px";
      toolRows.append(row);
    });
  }
  drawTools();
  form.append(toolRows, el("h3", "Keyboard shortcuts"));
  const keys = el("div", undefined, "grid");
  for (const [k, v] of Object.entries(s.shortcuts))
    keys.append(
      label(
        {
          newTab: "New tab",
          closeTab: "Close tab",
          address: "Address bar",
          search: "Multi-search",
          privateTab: "Private tab",
        }[k],
        input(k, "Control+Shift+F", v),
      ),
    );
  form.append(keys);
  submit(form, "Save preferences");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    for (const k of [
      "motion",
      "restoreSession",
      "splitSearch",
      "trackers",
      "httpsOnly",
      "dnt",
    ])
      d[k] = form.elements[k].checked;
    d.shortcuts = Object.fromEntries(
      Object.keys(s.shortcuts).map((k) => [k, d[k]]),
    );
    d.tools = order.filter((n) => enabled.has(n));
    if (await call("settings", d)) toast("Preferences saved.");
  };
  body.append(
    form,
    el("h3", "Extensions"),
    note(
      "Unpacked Chrome extensions only; compatibility depends on Electron’s supported APIs.",
    ),
    button(
      "Load unpacked extension",
      async () => {
        await call("extension");
        showPanel("settings");
      },
      "plus",
    ),
  );
  for (const e of state.extensions) {
    const row = el("div", undefined, "row");
    row.append(
      el("span", e.name),
      button(
        "Remove extension",
        async () => {
          await call("removeExtension", e.id);
          showPanel("settings");
        },
        "trash",
      ),
    );
    body.append(row);
  }
  body.append(
    note(`AltSeende ${state.appVersion} · Chromium ${state.version}`),
  );
}
function homePanel(body) {
  const form = el("form");
  form.append(
    label(
      "Home heading",
      input("homeTitle", "Start here.", state.settings.homeTitle),
    ),
    label(
      "Show saved spaces",
      checkbox("showPresets", state.settings.showPresets),
      "check row",
    ),
  );
  submit(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (
      await call("settings", {
        homeTitle: form.elements.homeTitle.value,
        showPresets: form.elements.showPresets.checked,
      })
    )
      toast("Home updated.");
  };
  body.append(form, el("h3", "Saved spaces"));
  const editor = el("form"),
    title = input("name", "Space name"),
    urls = el("textarea"),
    side = checkbox("split", true);
  urls.placeholder = "One HTTP(S) address per line";
  urls.setAttribute("aria-label", "Preset page URLs");
  let editing;
  const fill = (p) => {
    editing = p?.id;
    title.value = p?.name || "";
    urls.value = p?.urls.join("\n") || "";
    side.checked = p?.split ?? true;
    title.focus();
  };
  for (const p of state.settings.presets) {
    const row = el("div", undefined, "card row");
    row.append(
      el("span", `${p.name} · ${p.urls.length} pages`, "grow"),
      button("Open space", () => call("presetOpen", p.id), "play"),
      button("Edit space", () => fill(p), "edit"),
      button(
        "Delete space",
        async () => {
          await call("presetDelete", p.id);
          showPanel("home");
        },
        "trash",
      ),
    );
    body.append(row);
  }
  editor.append(
    el("h3", "Create or edit a space"),
    label("Name", title),
    label("Page addresses", urls),
    label("Open side by side (up to six pages)", side, "check row"),
    button(
      "Use currently open regular tabs",
      () => {
        urls.value = state.tabs
          .filter((t) => !t.private && t.url)
          .map((t) => t.url)
          .join("\n");
      },
      "groups",
    ),
    button("New empty preset", () => fill(), "plus"),
  );
  submit(editor, "Save space");
  editor.onsubmit = async (e) => {
    e.preventDefault();
    if (
      await call("presetSave", {
        id: editing,
        name: title.value,
        urls: urls.value
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        split: side.checked,
      })
    )
      showPanel("home");
  };
  body.append(editor);
}
function readerPanel(body) {
  body.append(
    note(
      "Read selected text or the page, or paste your own text. Requires installed system speech voices.",
    ),
  );
  const area = el("textarea");
  area.id = "reader-text";
  area.placeholder = "Paste text…";
  area.setAttribute("aria-label", "Text to read");
  body.append(area);
  const row = el("div", undefined, "row"),
    voices = select("voice", [], ""),
    rate = input("rate", "", 1);
  rate.type = "range";
  rate.min = ".5";
  rate.max = "2";
  rate.step = ".1";
  function fillVoices() {
    voices.replaceChildren();
    for (const [i, v] of speechSynthesis.getVoices().entries())
      voices.append(new Option(v.name + " / " + v.lang, i));
  }
  fillVoices();
  speechSynthesis.onvoiceschanged = fillVoices;
  row.append(label("Voice", voices), label("Speed", rate));
  row.append(
    button("Read page or selection", () => call("read"), "reader"),
    button(
      "Speak",
      () => {
        if (!area.value.trim()) return toast("Enter text or load a page.");
        if (!speechSynthesis.getVoices().length)
          return toast("No speech voices are installed.");
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(area.value);
        u.voice = speechSynthesis.getVoices()[voices.value];
        u.rate = Number(rate.value);
        u.onerror = (e) => toast("Speech error: " + e.error);
        speechSynthesis.speak(u);
      },
      "play",
    ),
    button(
      "Pause or resume",
      () =>
        speechSynthesis.paused
          ? speechSynthesis.resume()
          : speechSynthesis.pause(),
      "pause",
    ),
    button("Stop", () => speechSynthesis.cancel(), "stop"),
  );
  body.append(row);
}
function downloadsPanel(body) {
  body.append(
    note(
      "Find direct video files on the active page, or paste a media URL. To save an image, right-click it and choose “Save image as…”. DRM and streaming manifests are not supported.",
    ),
  );
  const row = el("div", undefined, "row"),
    url = input("mediaURL", "https://example.com/video.mp4");
  url.setAttribute("aria-label", "Direct media URL");
  row.append(
    url,
    button("Download URL", () => call("download", url.value), "downloads"),
    button(
      "Find videos on active page",
      async () => {
        const urls = await call("media"),
          list = $("#media-list");
        list.replaceChildren();
        if (!urls?.length) list.append(note("No direct video files found."));
        for (const u of urls || []) {
          const row = el("div", undefined, "card row");
          row.append(
            el("span", u, "grow"),
            button("Download video", () => call("download", u), "downloads"),
          );
          list.append(row);
        }
      },
      "search",
    ),
  );
  const media = el("div");
  media.id = "media-list";
  const list = el("div");
  list.id = "download-list";
  body.append(row, media, el("h3", "Downloads this session"), list);
  downloadList();
}
function downloadList() {
  const list = $("#download-list");
  if (!list) return;
  list.replaceChildren();
  if (!state.downloads.length) list.append(note("No downloads yet."));
  for (const d of state.downloads) {
    const row = el("div", undefined, "card row");
    row.append(
      el(
        "span",
        `${d.name} — ${d.state} · ${(d.received / 1048576).toFixed(1)} MB`,
        "grow",
      ),
    );
    if (d.path)
      row.append(
        button("Show in folder", () => call("showDownload", d.id), "groups"),
      );
    list.append(row);
  }
}
function speedPanel(body) {
  body.append(
    note(
      "A quick download estimate from Cloudflare. Running the test connects to speed.cloudflare.com and downloads up to 8 MB. Results depend on the route and server; no upload test is performed.",
    ),
  );
  const result = el("div", "Ready to measure.", "metric"),
    run = button(
      "Run download speed test",
      async () => {
        run.disabled = true;
        result.textContent = "Measuring…";
        const r = await call("speed");
        run.disabled = false;
        if (r) {
          result.replaceChildren(el("span", r.mbps + " "), el("small", "Mbps"));
          detail.textContent = `Request latency: ${r.latency} ms · ${(r.bytes / 1e6).toFixed(1)} MB downloaded`;
        } else result.textContent = "Test failed.";
      },
      "play",
      "primary",
    ),
    detail = note("");
  body.append(result, run, detail);
}
function animateIn(node) {
  if (
    state?.settings.motion === false ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  node.animate(
    [
      { opacity: 0, transform: "translateY(9px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
}
async function showAudio(id) {
  await showPanel("audio");
  document.querySelector(`[data-volume="${id}"]`)?.focus();
}
function audioPanel(body) {
  body.append(
    note(
      "Independent volume for audio/video players. Mute silences all sound in the tab, including Web Audio.",
    ),
  );
  for (const t of state.tabs) {
    const row = el("div", undefined, "card audio-row"),
      title = el("div", undefined, "grow");
    title.append(el("strong", t.title), el("small", t.url || "New tab"));
    const slider = input("volume", "", Math.round(t.volume * 100));
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.dataset.volume = t.id;
    slider.setAttribute("aria-label", "Volume for " + t.title);
    const output = el("output", slider.value + "%");
    let muted = t.muted;
    const mute = button(
      muted ? "Unmute tab" : "Mute tab",
      async () => {
        muted = !muted;
        const result = await call("volume", { id: t.id, muted });
        if (result) {
          mute.replaceChildren(icon(muted ? "muted" : "audio"));
          mute.title = muted ? "Unmute tab" : "Mute tab";
          mute.setAttribute("aria-label", mute.title);
          mute.classList.toggle("active", muted);
        }
      },
      muted ? "muted" : "audio",
    );
    mute.classList.toggle("active", muted);
    slider.oninput = () => {
      output.textContent = slider.value + "%";
      call("volume", { id: t.id, volume: Number(slider.value) / 100 });
    };
    row.append(title, mute, slider, output);
    body.append(row);
  }
}
function bookmarksPanel(body) {
  const filter = input("bookmarks-filter", "Find a bookmark…");
  body.append(
    filter,
    button(
      "Export bookmarks",
      () => call("bookmarksExport").then((r) => r && toast(r)),
      "external",
    ),
    button(
      "Import bookmarks",
      async () => {
        if (await call("bookmarksImport")) showPanel("bookmarks");
      },
      "plus",
    ),
  );
  filter.oninput = () => {
    for (const row of body.querySelectorAll(".card"))
      row.hidden = !row.textContent
        .toLowerCase()
        .includes(filter.value.toLowerCase());
  };
  body.append(
    button(
      "Bookmark current page",
      async () => {
        if (await call("bookmarkAdd")) showPanel("bookmarks");
      },
      "plus",
      "primary",
    ),
  );
  if (!state.settings.bookmarks.length)
    body.append(note("Save a page with +."));
  for (const b of state.settings.bookmarks) {
    const row = el("div", undefined, "card row"),
      text = el("div", undefined, "grow");
    text.append(el("strong", b.title), el("small", b.url));
    row.append(
      text,
      button("Open bookmark", () => call("bookmarkOpen", b.id), "external"),
      button(
        "Rename bookmark",
        () => {
          const field = input("title", "", b.title);
          text.replaceChildren(field);
          const save = button(
            "Save title",
            async () => {
              await call("bookmarkRename", { id: b.id, title: field.value });
              showPanel("bookmarks");
            },
            "save",
          );
          text.append(save);
          field.focus();
        },
        "edit",
      ),
      button(
        "Remove bookmark",
        async () => {
          await call("bookmarkRemove", b.id);
          showPanel("bookmarks");
        },
        "trash",
      ),
    );
    body.append(row);
  }
}
function zoomPanel(body) {
  const t = state.tabs.find((t) => t.id === state.active),
    range = input("zoom", "", Math.round((t?.zoom || 1) * 100));
  range.type = "range";
  range.min = "50";
  range.max = "200";
  range.step = "10";
  range.setAttribute("aria-label", "Page zoom");
  const value = el("div", range.value + "%", "metric");
  range.oninput = () => {
    value.textContent = range.value + "%";
    call("zoom", Number(range.value) / 100);
  };
  body.append(
    value,
    range,
    button(
      "Reset zoom",
      () => {
        range.value = 100;
        value.textContent = "100%";
        call("zoom", 1);
      },
      "reload",
    ),
  );
}
async function openFind() {
  await hidePanel();
  $("#findbar").hidden = false;
  $("#address-form").hidden = true;
  $("#find-text").focus();
  $("#find-text").select();
}
function closeFind() {
  $("#findbar").hidden = true;
  $("#address-form").hidden = false;
  call("find", { text: "" });
}
window.alt.onFound((r) => {
  $("#find-count").textContent = `${r.activeMatchOrdinal || 0}/${r.matches}`;
});
$("#findbar").onsubmit = (e) => {
  e.preventDefault();
  call("find", { text: $("#find-text").value, next: true });
};
$("#find-next").onclick = () =>
  call("find", { text: $("#find-text").value, next: true });
$("#find-prev").onclick = () =>
  call("find", { text: $("#find-text").value, next: true, forward: false });
$("#find-close").onclick = closeFind;
$("#find-text").oninput = () =>
  call("find", { text: $("#find-text").value, next: false });
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openFind();
  }
  if (e.key === "Escape" && !$("#findbar").hidden) closeFind();
});
for (const b of document.querySelectorAll("[data-icon]"))
  b.append(icon(b.dataset.icon));
for (const b of document.querySelectorAll("[data-panel]"))
  b.onclick = () => showPanel(b.dataset.panel);
$("#close-panel").onclick = hidePanel;
for (const id of ["new-tab", "brand"])
  $("#" + id).onclick = async () => {
    await hidePanel();
    await call("new");
  };
$("#manage-tabs").onclick = () => showPanel("groups");
$("#edit-home").onclick = () => showPanel("home");
$("#blocker").onclick = () => showPanel("settings");
for (const a of ["back", "forward", "reload"])
  $("#" + a).onclick = () => call(a);
$("#address").oninput = () => (addressDirty = true);
$("#address").onblur = () => {
  addressDirty = false;
  if (state)
    $("#address").value =
      state.tabs.find((t) => t.id === state.active)?.url || "";
};
$("#address-form").onsubmit = async (e) => {
  e.preventDefault();
  const value = $("#address").value;
  addressDirty = false;
  if (await call("navigate", value)) hidePanel();
};
$("#home-search").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("#home-query").value.trim();
  if (!text) return;
  if ($("#home-multi").checked)
    await call("search", {
      text,
      engines: ["Google", "Yandex", "DuckDuckGo"],
      split: true,
    });
  else {
    await call("settings", { engine: $("#home-engine").value });
    await call("navigate", text);
  }
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (panel) hidePanel();
    else {
      addressDirty = false;
      $("#address").blur();
    }
  }
});
call("state").then((s) => s && render(s));
