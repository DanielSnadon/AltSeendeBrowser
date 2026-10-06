const guides = {
  fullscreen: [
    "Fullscreen",
    "Toggle with F11 or this tool. Press F11 again to return.",
  ],
  private: [
    "Private tab",
    "Open an in-memory browsing tab. These tabs and their history are not restored. Downloads and explicitly saved bookmarks remain.",
  ],
  copyLink: [
    "Copy address",
    "Copy the full address of the active page. Use Clean link to remove common advertising parameters.",
  ],
  search: [
    "Multi-search",
    "Enter a query, exact phrase or domain. The large search icon opens all six engines in a 3 × 2 view. The checkmark uses only selected engines.",
  ],
  split: [
    "Split view",
    "Use the split icon in the top bar: choose 2–6 pages, columns, or individual tabs. Each pane has its own address and volume.",
  ],
  network: [
    "VPN & connection",
    "Unlock the vault and paste a VLESS, VMess, Trojan, Shadowsocks, SOCKS5 or HTTP(S) link from your provider or NekoBox. Select Connect. This tunnels this browser, not the whole computer. A server is required; none is provided. Connected means the local core is running, not that the remote server is reachable. No direct fallback: reconnect or explicitly disconnect after failure. After restart, protected browsing stays blocked until you reconnect. TLS/REALITY, TCP, WebSocket and gRPC are supported. Other transports can use a local NekoBox SOCKS5 endpoint.",
  ],
  vault: [
    "Passwords",
    "Create a master password of at least 12 characters. Credentials and tunnel profiles are encrypted locally with AES-256-GCM and scrypt. Unlock lasts five minutes without vault activity. Add entries manually. Fill only works on the exact saved origin and never submits the form. Passwords inside iframes are not filled. There is no cloud sync or master-password recovery; keep a backup of your encrypted vault.",
  ],
  portal: [
    "Network sign-in",
    "After joining Wi-Fi, open Network sign-in. A separate temporary window contacts the Firefox HTTP connectivity page so the network can redirect to its login page. It deliberately bypasses the browser tunnel and HTTPS-only mode. Close it after signing in, then reconnect the tunnel. Network connection itself is managed by Fedora.",
  ],
  qr: [
    "Page QR",
    "Open any page and choose QR. The code is created on your computer without sending the address to a service. Save it as PNG.",
  ],
  dark: [
    "Dark websites",
    "The moon toggles dark mode for the current site and remembers that choice. Uses local Dark Reader processing. Some complex pages may need it switched off.",
  ],
  bookmarks: [
    "Bookmarks",
    "The plus saves the current page. Search, rename or open entries here. Import/export uses AltSeende JSON files.",
  ],
  history: [
    "History",
    "Recent regular pages are stored locally (up to 1,000). Private pages are excluded. Search or erase the history here.",
  ],
  tabSearch: [
    "Find a tab",
    "Filter open tabs by title or address and jump to one. Pinned tabs appear first.",
  ],
  reopen: [
    "Reopen closed tab",
    "Restore the last closed regular tab, or press Ctrl+Shift+T. The last 25 closed tabs are kept for this run. Private tabs are excluded.",
  ],
  duplicate: [
    "Duplicate tab",
    "Create a second tab with the same address, volume and group. Private status is preserved.",
  ],
  pin: [
    "Pin tab",
    "Toggle the pin on the active tab. Pinned tabs appear first and are restored with regular sessions.",
  ],
  reading: [
    "Read later",
    "Save a page to a separate reading queue. This saves the address, not an offline copy.",
  ],
  notes: [
    "Page notes",
    "Save a local note attached to this exact address. Private tabs do not save notes.",
  ],
  cleanLink: [
    "Clean link",
    "Copy the current address without common tracking parameters such as utm_*, gclid and fbclid. Other parameters stay intact.",
  ],
  audio: [
    "Tab audio",
    "Use each tab’s speaker or the mixer to set volume or mute. The slider controls HTML audio/video, including frames; native mute silences the whole tab. Web Audio synthesis does not follow the slider.",
  ],
  downloads: [
    "Downloads",
    "Find direct video links and download them, or paste a direct media address. DRM and many streaming players cannot be downloaded. Right-click images to save them.",
  ],
  screenshot: ["Screenshots", "Save the active page’s visible area as PNG."],
  reader: [
    "Read aloud",
    "Read page text, selection or pasted text. Choose an installed system voice and playback speed.",
  ],
  home: [
    "Home & spaces",
    "Customize the home title and save sets of addresses as spaces. Open a space in tabs or side by side.",
  ],
  groups: [
    "Groups",
    "Select tabs, create a group or rename it. Regular tabs, groups and split layout restore at launch when enabled.",
  ],
  settings: [
    "Preferences",
    "Choose and reorder toolbar tools, animation, privacy, default search and hotkeys. Ctrl+L selects the address; Ctrl+T adds a tab; Ctrl+W closes it. Escape closes a panel.",
  ],
  zoom: ["Zoom", "Set the active page to 50–200%, or reset to 100%."],
  find: [
    "Find in page",
    "Ctrl+F opens the page search. Enter advances; arrows change direction.",
  ],
  pdf: ["Save PDF", "Export the active page as a PDF using Chromium."],
  print: ["Print", "Open the system print dialog for the active page."],
  speed: [
    "Connection speed",
    "Run an optional 8 MB Cloudflare download test. Its result is an estimate, not a guarantee.",
  ],
};
function controlPanel(body) {
  const search = input("tools", "Find a tool or read how it works…");
  search.setAttribute("aria-label", "Find a tool");
  const list = el("div");
  const draw = () => {
    list.replaceChildren();
    for (const [key, [title, help]] of Object.entries(guides)) {
      if (
        !(title + " " + help).toLowerCase().includes(search.value.toLowerCase())
      )
        continue;
      const detail = el("details", undefined, "help-item"),
        summary = el("summary", title),
        row = el("div", undefined, "row");
      row.append(
        button(
          "Open " + title,
          () =>
            key === "settings"
              ? showPanel("settings")
              : key === "split"
                ? call("quickSplit")
                : actionTool(key),
          key,
        ),
        note(help),
      );
      detail.append(summary, row);
      list.append(detail);
    }
  };
  search.oninput = draw;
  body.append(
    note("Everything in one place. Open a heading for help."),
    search,
    list,
  );
  draw();
  search.focus();
}
async function networkPanel(body) {
  const status = el("div", undefined, "card"),
    renderStatus = () => {
      const n = state.network || {};
      status.replaceChildren(
        el(
          "strong",
          n.mode === "connected"
            ? "Tunnel running"
            : n.mode === "direct"
              ? "Direct connection"
              : n.mode === "connecting"
                ? "Connecting…"
                : "Browsing blocked",
        ),
        note(n.name || n.error || "Add a server profile to connect."),
      );
    };
  renderStatus();
  const disconnect = button(
    "Disconnect — use direct connection",
    async () => {
      await call("networkDisconnect");
      await showPanel("network");
    },
    "close",
  );
  body.append(
    status,
    disconnect,
    note(
      "Browser traffic only. Your own server profile is required. Network sign-in bypasses this connection.",
    ),
    button("Open network sign-in", () => call("portal"), "portal"),
  );
  const unlocked = await call("vaultStatus");
  if (!unlocked?.unlocked) {
    body.append(
      button("Unlock connection profiles", () => showPanel("vault"), "vault"),
      note("Unlock the vault to import or connect."),
    );
    return;
  }
  const form = el("form"),
    link = input(
      "profile",
      "vless:// · vmess:// · trojan:// · ss:// · socks5://",
    );
  link.type = "password";
  link.autocomplete = "off";
  form.append(label("Import profile link", link));
  submit(form, "Import profile", "plus");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await call("networkImport", link.value)) {
      link.value = "";
      showPanel("network");
    }
  };
  body.append(form);
  const profiles = await call("networkProfiles");
  for (const p of profiles || []) {
    const row = el("div", undefined, "card row"),
      text = el("div", undefined, "grow");
    text.append(
      el("strong", p.name),
      el("small", p.protocol + " · " + p.server),
    );
    row.append(
      text,
      button(
        "Connect " + p.name,
        async (e) => {
          e.currentTarget.disabled = true;
          await call("networkConnect", p.id);
          showPanel("network");
        },
        "network",
      ),
      button(
        "Remove profile",
        async () => {
          await call("networkRemove", p.id);
          showPanel("network");
        },
        "trash",
      ),
    );
    body.append(row);
  }
}
async function vaultPanel(body) {
  const status = await call("vaultStatus");
  if (!status) return;
  if (!status.unlocked) {
    const form = el("form"),
      pw = input("master", "At least 12 characters");
    pw.type = "password";
    pw.autocomplete = status.exists ? "current-password" : "new-password";
    form.append(
      label(status.exists ? "Unlock vault" : "Create master password", pw),
    );
    if (!status.exists) {
      const confirm = input("confirm", "Repeat master password");
      confirm.type = "password";
      form.append(label("Confirm", confirm));
    }
    submit(form, status.exists ? "Unlock" : "Create vault", "vault");
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (form.elements.confirm && pw.value !== form.elements.confirm.value)
        return toast("Passwords do not match.");
      const r = await call("vaultUnlock", pw.value);
      pw.value = "";
      if (r) showPanel("vault");
    };
    body.append(
      note(
        "Encrypted locally · locks after 5 minutes of vault inactivity. There is no master-password recovery.",
      ),
      form,
    );
    pw.focus();
    return;
  }
  body.append(
    button(
      "Lock vault",
      async () => {
        await call("vaultLock");
        showPanel("vault");
      },
      "vault",
    ),
    button("Connection profiles", () => showPanel("network"), "network"),
  );
  const t = state.tabs.find((t) => t.id === state.active),
    form = el("form"),
    origin = input(
      "origin",
      "https://example.com",
      t?.url ? new URL(t.url).origin : "",
    ),
    user = input("username", "Username"),
    pass = input("password", "Password");
  pass.type = "password";
  pass.autocomplete = "new-password";
  form.append(
    label("Site origin", origin),
    label("Username", user),
    label("Password", pass),
    button(
      "Generate strong password",
      async () => {
        pass.value = (await call("passwordGenerate")) || "";
      },
      "reload",
    ),
  );
  submit(form, "Save password", "save");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (
      await call("vaultSave", {
        origin: origin.value,
        username: user.value,
        password: pass.value,
      })
    ) {
      pass.value = "";
      showPanel("vault");
    }
  };
  body.append(form);
  const entries = await call("vaultList");
  for (const v of entries || []) {
    const row = el("div", undefined, "card row"),
      text = el("div", undefined, "grow");
    text.append(el("strong", v.origin), el("small", v.username));
    row.append(
      text,
      button(
        "Fill on exact matching site",
        async () => {
          const r = await call("vaultFill", v.id);
          if (r) {
            await hidePanel();
            toast(r);
          }
        },
        "check",
      ),
      button(
        "Copy password for 30 seconds",
        async () => {
          const r = await call("vaultCopy", v.id);
          if (r) toast(r);
        },
        "copyLink",
      ),
      button(
        "Delete password",
        async () => {
          await call("vaultRemove", v.id);
          showPanel("vault");
        },
        "trash",
      ),
    );
    body.append(row);
  }
}
async function qrPanel(body) {
  const result = await call("qr");
  if (!result) return;
  const img = el("img");
  img.src = result;
  img.alt = "QR code for current page";
  img.className = "qr-image";
  body.append(
    img,
    note(state.tabs.find((t) => t.id === state.active)?.url || ""),
    button(
      "Save QR as PNG",
      async () => {
        const r = await call("qrSave");
        if (r) toast(r);
      },
      "save",
    ),
  );
}
async function libraryPanel(body, type) {
  let data =
    type === "history"
      ? await call("history")
      : type === "tabSearch"
        ? state.tabs
        : state.settings.readingList || [];
  data ||= [];
  const query = input("filter", "Search titles or addresses…"),
    list = el("div");
  if (type === "reading")
    body.append(
      button(
        "Add current page",
        async () => {
          if (await call("readingAdd")) showPanel("reading");
        },
        "plus",
      ),
    );
  if (type === "history")
    body.append(
      button(
        "Erase browsing history",
        async () => {
          await call("historyClear");
          showPanel("history");
        },
        "trash",
      ),
    );
  const draw = () => {
    list.replaceChildren();
    for (const item of data.filter((x) =>
      (x.title + " " + x.url).toLowerCase().includes(query.value.toLowerCase()),
    )) {
      const row = el("div", undefined, "card row"),
        text = el("div", undefined, "grow");
      text.append(el("strong", item.title), el("small", item.url));
      row.append(
        text,
        button(
          "Open " + item.title,
          async () => {
            await hidePanel();
            call(
              type === "tabSearch" ? "activate" : "openURL",
              type === "tabSearch" ? item.id : item.url,
            );
          },
          "external",
        ),
      );
      if (type === "reading")
        row.append(
          button(
            "Remove from reading list",
            async () => {
              await call("readingRemove", item.id);
              showPanel("reading");
            },
            "trash",
          ),
        );
      list.append(row);
    }
  };
  query.oninput = draw;
  body.append(query, list);
  draw();
}
function notesPanel(body) {
  const t = state.tabs.find((t) => t.id === state.active);
  if (!t?.url) {
    body.append(note("Open a page first."));
    return;
  }
  const form = el("form"),
    text = el("textarea");
  text.value = state.settings.notes?.[t.url] || "";
  text.rows = 12;
  text.maxLength = 20000;
  text.setAttribute("aria-label", "Notes for this page");
  form.append(note(t.url), text);
  submit(form, "Save page note");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await call("noteSave", { url: t.url, text: text.value }))
      toast("Note saved.");
  };
  body.append(form);
}
