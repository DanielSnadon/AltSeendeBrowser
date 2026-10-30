const { ipcMain } = require("electron");
const crypto = require("node:crypto");
function safeOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
      ? u.origin
      : null;
  } catch {
    return null;
  }
}
module.exports = function pageTools(c, vault) {
  let offer = null;
  const pending = new Map();
  const cooldown = new Map();
  const trusted = (e) => {
    const t = [...c.tabs.values()].find((t) => t.view.webContents === e.sender);
    return t &&
      e.senderFrame === e.sender.mainFrame &&
      /^https?:/.test(e.senderFrame.url)
      ? t
      : null;
  };
  const changed = () => {
    c.layout();
    c.publish();
  };
  vault.onLock = changed;
  function clear(id) {
    if (offer && (!id || offer.tab === id)) {
      offer = null;
      changed();
    }
  }
  function describe() {
    if (!offer) return null;
    const t = c.tabs.get(offer.tab);
    if (
      !t ||
      c.current()?.id !== t.id ||
      t.view.webContents.getURL() !== offer.url
    )
      return null;
    const unlocked = vault.status().unlocked;
    const entries = unlocked
      ? vault
          .metadata("passwords")
          .filter((x) => x.origin === offer.origin)
          .map(({ id, username }) => ({ id, username }))
      : [];
    return { ...offer, locked: !unlocked, entries };
  }
  function suggest(t, token) {
    if (
      !c.settings().passwordSuggestions ||
      t.private ||
      t.id !== c.current()?.id
    )
      return;
    const url = t.view.webContents.getURL(),
      origin = safeOrigin(url);
    if (!origin) return;
    if (
      vault.status().unlocked &&
      !vault.list("passwords").some((x) => x.origin === origin)
    )
      return;
    if (!vault.status().exists) return;
    offer = { tab: t.id, origin, url, token };
    changed();
  }
  ipcMain.handle("page-options", (e) =>
    trusted(e)
      ? {
          gestures: c.settings().gestures,
          passwordSuggestions: c.settings().passwordSuggestions,
        }
      : {},
  );
  ipcMain.on("password-focus", (e, d) => {
    const t = trusted(e);
    if (!t || typeof d?.token !== "string" || d.token.length > 100) return;
    suggest(t, d.token);
  });
  ipcMain.on("history-gesture", (e, d) => {
    const t = trusted(e);
    if (
      !t ||
      !c.settings().gestures ||
      t.id !== c.current()?.id ||
      !["back", "forward"].includes(d)
    )
      return;
    const now = Date.now();
    if (now - (cooldown.get(t.id) || 0) < 800) return;
    cooldown.set(t.id, now);
    const h = t.view.webContents.navigationHistory;
    if (d === "back" && h.canGoBack()) h.goBack();
    if (d === "forward" && h.canGoForward()) h.goForward();
  });
  ipcMain.on("credentials-filled", (e, d) => {
    const t = trusted(e),
      p = pending.get(d?.request);
    if (!t || !p || p.tab !== t.id) return;
    pending.delete(d.request);
    clearTimeout(p.timer);
    p.resolve(d.ok === true);
  });
  async function fill(t, entry, token = null) {
    const wc = t.view.webContents,
      url = wc.getURL(),
      origin = safeOrigin(url);
    if (!origin || entry.origin !== origin)
      throw Error("Open the exact saved site before filling.");
    const request = crypto.randomUUID();
    const ok = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(request);
        resolve(false);
      }, 2500);
      pending.set(request, { tab: t.id, resolve, timer });
      wc.send("credential-fill", {
        request,
        token,
        origin,
        url,
        username: entry.username,
        password: entry.password,
      });
    });
    if (!ok)
      throw Error(
        "The sign-in form changed or no visible password field was found. Click the field and try again.",
      );
    clear(t.id);
    return "Filled. Review the form and sign in yourself.";
  }
  const actions = {
    passwordDismiss: async () => {
      clear();
      return true;
    },
    passwordChoose: async (d) => {
      const t = c.current();
      if (
        !offer ||
        offer.tab !== t?.id ||
        offer.token !== d.token ||
        offer.url !== t.view.webContents.getURL()
      )
        throw Error(
          "This suggestion has expired. Click the sign-in field again.",
        );
      const entry = vault.get("passwords", d.id);
      return fill(t, entry, offer.token);
    },
  };
  return {
    actions,
    fill,
    clear,
    describe,
    suggest,
    refresh: changed,
    updateOptions() {
      for (const t of c.tabs.values())
        t.view.webContents.send("page-options", {
          gestures: c.settings().gestures,
          passwordSuggestions: c.settings().passwordSuggestions,
        });
      if (!c.settings().passwordSuggestions) clear();
    },
    stop() {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.resolve(false);
      }
      pending.clear();
    },
  };
};
module.exports.safeOrigin = safeOrigin;
