const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const QRCode = require("qrcode");
const { Vault } = require("./vault.cjs");
const { Tunnel, parseProfile } = require("./network.cjs");
const cleanURL = (value) => {
  const u = new URL(value);
  for (const k of [...u.searchParams.keys()])
    if (
      /^utm_/i.test(k) ||
      ["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid"].includes(k)
    )
      u.searchParams.delete(k);
  return u.href;
};
module.exports = function createFeatures(c) {
  const { app, dialog, clipboard, BrowserWindow, Menu } = require("electron");
  const vault = new Vault(c.profileFile("vault"));
  const binary = app.isPackaged
    ? path.join(process.resourcesPath, "tunnel", "sing-box")
    : path.join(__dirname, "../assets/tunnel/sing-box");
  const tunnel = new Tunnel(binary, c.sessions, c.publish);
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(c.profileFile("history"), "utf8"));
  } catch {}
  const closed = [];
  let portal = null;
  const active = () => {
    const t = c.current();
    if (!t?.url) throw Error("Open a page first.");
    return t;
  };
  const page = () => active().view.webContents;
  const save = () => {
    c.save();
    c.publish();
  };
  const refresh = (fn) => async (d) => {
    await fn(d);
    c.publish();
    return c.state();
  };
  async function applyDark(t) {
    const wc = t.view.webContents;
    if (wc.isDestroyed() || !/^https?:/.test(t.url)) return;
    const enabled = !!c.settings().darkSites?.includes(new URL(t.url).origin);
    if (!enabled) {
      await wc
        .executeJavaScriptInIsolatedWorld(999, [
          { code: "globalThis.DarkReader?.disable()" },
        ])
        .catch(() => {});
      return;
    }
    const source = fs.readFileSync(require.resolve("darkreader"), "utf8");
    await wc
      .executeJavaScriptInIsolatedWorld(999, [
        {
          code: `if(!globalThis.DarkReader){${source}}\n;globalThis.DarkReader.setFetchMethod(()=>Promise.reject(new Error('External image analysis disabled')));globalThis.DarkReader.${enabled ? "enable({brightness:100,contrast:95,sepia:0})" : "disable()"};`,
        },
      ])
      .catch(() => {});
  }
  const actions = {
    quickSplit: async () => {
      const state = c.state();
      const open = state.tabs.filter((t) => t.url);
      Menu.buildFromTemplate([
        { label: "Single page", click: () => c.setSplit([]) },
        ...[2, 3, 4, 6].map((n) => ({
          label: `Show ${n} pages`,
          enabled: open.length >= n,
          click: () => {
            const ids = [
              state.active,
              ...open.map((t) => t.id).filter((id) => id !== state.active),
            ]
              .filter((id) => open.some((t) => t.id === id))
              .slice(0, n);
            c.setSplit(ids);
          },
        })),
        { type: "separator" },
        ...[1, 2, 3].map((n) => ({
          label: `${n} column${n === 1 ? "" : "s"}`,
          type: "radio",
          checked: c.settings().splitColumns === n,
          click: () => {
            c.settings().splitColumns = n;
            save();
            c.layout();
            c.publish();
          },
        })),
        { type: "separator" },
        ...open.map((t) => ({
          label: t.title.slice(0, 70),
          type: "checkbox",
          checked: state.split.includes(t.id),
          click: () => {
            let ids = state.split.length ? [...state.split] : [state.active];
            ids = ids.includes(t.id)
              ? ids.filter((id) => id !== t.id)
              : [...ids, t.id];
            if (ids.length === 1) c.activate(ids[0]);
            else c.setSplit(ids);
          },
        })),
      ]).popup({ window: c.win() });
      return true;
    },
    qr: async () =>
      QRCode.toDataURL(active().url, {
        width: 320,
        margin: 3,
        errorCorrectionLevel: "M",
      }),
    qrSave: async () => {
      const bytes = await QRCode.toBuffer(active().url, {
        width: 1024,
        margin: 4,
      });
      const r = await dialog.showSaveDialog(c.win(), {
        defaultPath: "AltSeende-QR.png",
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!r.canceled) fs.writeFileSync(r.filePath, bytes);
      return r.canceled ? "Cancelled." : "QR code saved.";
    },
    dark: refresh(async () => {
      const origin = new URL(active().url).origin;
      const s = c.settings();
      s.darkSites ||= [];
      s.darkSites = s.darkSites.includes(origin)
        ? s.darkSites.filter((x) => x !== origin)
        : [...s.darkSites, origin];
      c.save();
      for (const t of c.tabs.values()) await applyDark(t);
    }),
    cleanLink: async () => {
      clipboard.writeText(cleanURL(active().url));
      return "Clean address copied.";
    },
    duplicate: refresh(() => {
      const t = active();
      c.newTab(t.url, t.private, {
        group: t.group,
        volume: t.volume,
        muted: t.muted,
      });
    }),
    pin: refresh(() => {
      const t = c.current();
      t.pinned = !t.pinned;
    }),
    reopen: refresh(() => {
      const t = closed.pop();
      if (!t) throw Error("No recently closed regular tabs.");
      c.newTab(t.url, false, t);
    }),
    history: async () => history,
    historyClear: refresh(() => {
      history = [];
      c.atomicJSON(c.profileFile("history"), history);
    }),
    openURL: refresh((d) => {
      const u = new URL(d);
      if (!["http:", "https:"].includes(u.protocol))
        throw Error("HTTP(S) only.");
      c.newTab(u.href);
    }),
    readingAdd: refresh(() => {
      const t = active(),
        s = c.settings();
      s.readingList ||= [];
      if (!s.readingList.some((x) => x.url === t.url))
        s.readingList.push({
          id: crypto.randomUUID(),
          title: t.title,
          url: t.url,
        });
      c.save();
    }),
    readingRemove: refresh((id) => {
      c.settings().readingList = c
        .settings()
        .readingList.filter((x) => x.id !== id);
      c.save();
    }),
    noteSave: refresh((data) => {
      const t = active();
      const text = typeof data === "string" ? data : data.text;
      if (typeof data === "object" && data.url !== t.url)
        throw Error("The page changed. Reopen notes for this page.");
      if (t.private) throw Error("Notes are not saved from private tabs.");
      const s = c.settings();
      s.notes ||= {};
      s.notes[t.url] = String(text).slice(0, 20000);
      c.save();
    }),
    bookmarkRename: refresh((d) => {
      const b = c.settings().bookmarks.find((x) => x.id === d.id);
      if (b) b.title = String(d.title).trim().slice(0, 150) || b.title;
      c.save();
    }),
    bookmarksExport: async () => {
      const r = await dialog.showSaveDialog(c.win(), {
        defaultPath: "AltSeende-bookmarks.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!r.canceled)
        fs.writeFileSync(
          r.filePath,
          JSON.stringify(c.settings().bookmarks, null, 2),
        );
      return r.canceled ? "Cancelled." : "Bookmarks exported.";
    },
    bookmarksImport: refresh(async () => {
      const r = await dialog.showOpenDialog(c.win(), {
        properties: ["openFile"],
        filters: [{ name: "AltSeende JSON", extensions: ["json"] }],
      });
      if (r.canceled) return;
      if (fs.statSync(r.filePaths[0]).size > 2e6)
        throw Error("File exceeds 2 MB.");
      const data = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8"));
      if (!Array.isArray(data) || data.length > 5000)
        throw Error("Invalid bookmarks file.");
      const items = data.map((b) => {
        const u = new URL(b.url);
        if (!["https:", "http:"].includes(u.protocol))
          throw Error("Invalid bookmark URL.");
        return {
          id: crypto.randomUUID(),
          title: String(b.title || u.hostname).slice(0, 150),
          url: u.href,
        };
      });
      const s = c.settings();
      for (const b of items)
        if (!s.bookmarks.some((x) => x.url === b.url)) s.bookmarks.push(b);
      c.save();
    }),
    vaultStatus: async () => vault.status(),
    vaultUnlock: async (p) => vault.unlock(p),
    vaultLock: async () => {
      vault.lock();
      return vault.status();
    },
    vaultList: async () => vault.list("passwords"),
    vaultSave: async (d) => {
      const u = new URL(d.origin);
      if (
        u.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(u.hostname)
      )
        throw Error("Save passwords for HTTPS sites only.");
      if (!d.password || String(d.password).length > 2048)
        throw Error("Enter a password (up to 2048 characters).");
      vault.put("passwords", {
        origin: u.origin,
        username: String(d.username || "").slice(0, 300),
        password: String(d.password),
      });
      return true;
    },
    vaultCopy: async (id) => {
      const password = vault.get("passwords", id).password;
      clipboard.writeText(password);
      const timer = setTimeout(() => {
        if (clipboard.readText() === password) clipboard.clear();
      }, 30000);
      timer.unref();
      return "Password copied for 30 seconds.";
    },
    vaultRemove: async (id) => {
      vault.remove("passwords", id);
      return true;
    },
    passwordGenerate: async () => crypto.randomBytes(24).toString("base64url"),
    vaultFill: async (id) => {
      const t = active();
      const entry = vault.get("passwords", id);
      const origin = new URL(t.view.webContents.getURL()).origin;
      if (origin !== entry.origin)
        throw Error("Open the exact saved site before filling.");
      const ok = await page().executeJavaScriptInIsolatedWorld(998, [
        {
          code: `(()=>{if(location.origin!==${JSON.stringify(origin)})return false;const password=[...document.querySelectorAll('input[type=password]')].find(x=>x.getClientRects().length&&!x.disabled);if(!password)return false;const root=password.form||document;const user=[...root.querySelectorAll('input')].find(x=>['text','email'].includes(x.type)&&x.getClientRects().length&&!x.disabled);const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};if(user)set(user,${JSON.stringify(entry.username)});set(password,${JSON.stringify(entry.password)});return true;})()`,
        },
      ]);
      if (!ok) throw Error("No visible password form found in the main page.");
      return "Filled. Review the form and sign in yourself.";
    },
    networkProfiles: async () => vault.list("profiles"),
    networkImport: async (link) => {
      vault.put("profiles", parseProfile(link));
      return true;
    },
    networkRemove: async (id) => {
      vault.remove("profiles", id);
      return true;
    },
    networkConnect: async (id) => {
      const p = vault.get("profiles", id);
      c.settings().networkGuard = true;
      c.save();
      await tunnel.connect(p);
      return tunnel.status;
    },
    networkDisconnect: async () => {
      await tunnel.disconnect();
      c.settings().networkGuard = false;
      save();
      return tunnel.status;
    },
    portal: async () => {
      if (portal && !portal.isDestroyed()) {
        portal.focus();
        return true;
      }
      portal = new BrowserWindow({
        width: 900,
        height: 680,
        title: "Network sign-in · direct connection",
        parent: c.win(),
        webPreferences: {
          partition: "portal-" + Date.now(),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      const ses = portal.webContents.session;
      await ses.setProxy({ mode: "direct" });
      ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      ses.setPermissionCheckHandler(() => false);
      portal.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/.test(url)) portal.loadURL(url).catch(() => {});
        return { action: "deny" };
      });
      portal.webContents.on("will-navigate", (e, url) => {
        if (!/^https?:/.test(url)) e.preventDefault();
      });
      portal.on("page-title-updated", (e) => e.preventDefault());
      portal.on("closed", () => {
        ses.clearStorageData().catch(() => {});
        portal = null;
      });
      // Explicit, isolated HTTP probe: HTTPS-only and the browser tunnel do not apply here.
      portal
        .loadURL("http://detectportal.firefox.com/canonical.html")
        .catch(() => {});
      return true;
    },
  };
  return {
    actions,
    vault,
    tunnel,
    applyDark,
    historyVisit(t) {
      if (t.private || !/^https?:/.test(t.url)) return;
      history = history.filter((x) => x.url !== t.url);
      history.unshift({ title: t.title, url: t.url, time: Date.now() });
      history = history.slice(0, 1000);
      c.atomicJSON(c.profileFile("history"), history);
    },
    closed(t) {
      if (!t.private && t.url) {
        closed.push({
          url: t.url,
          title: t.title,
          group: t.group,
          volume: t.volume,
          muted: t.muted,
          pinned: t.pinned,
        });
        if (closed.length > 25) closed.shift();
      }
    },
    status: () => ({
      network: tunnel.status,
      vault: vault.status(),
      closedCount: closed.length,
    }),
    stop() {
      vault.lock();
      tunnel.stop();
    },
  };
};
module.exports.cleanURL = cleanURL;
