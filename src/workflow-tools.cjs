const crypto = require("node:crypto");
module.exports = function workflowTools(c) {
  const { dialog } = require("electron");
  let solo = null;
  const current = () => {
    const t = c.current();
    if (!t?.url) throw Error("Open a page first.");
    return t;
  };
  const ordered = () => {
    const ts = [...c.tabs.values()],
      groups = [...new Set(ts.map((t) => t.group))];
    return [
      ...ts.filter((t) => t.pinned),
      ...groups.flatMap((g) => ts.filter((t) => t.group === g && !t.pinned)),
    ];
  };
  const done = () => {
    c.publish();
    return c.state();
  };
  return {
    nextTab: async (reverse) => {
      const ts = ordered(),
        i = ts.findIndex((t) => t.id === c.current()?.id);
      if (ts.length)
        c.activate(
          ts[(i + (reverse ? -1 : 1) + ts.length) % ts.length].id,
          true,
        );
      return done();
    },
    numberedTab: async (n) => {
      const ts = ordered(),
        t = ts[n === 9 ? ts.length - 1 : n - 1];
      if (t) c.activate(t.id, true);
      return done();
    },
    closeOthers: async () => {
      const id = c.current()?.id;
      for (const t of [...c.tabs.values()])
        if (t.id !== id && !t.pinned) c.closeTab(t.id);
      return done();
    },
    closeRight: async () => {
      const ts = ordered(),
        i = ts.findIndex((t) => t.id === c.current()?.id);
      for (const t of ts.slice(i + 1)) if (!t.pinned) c.closeTab(t.id);
      return done();
    },
    deduplicate: async () => {
      const active = c.current();
      const seen = new Set(),
        remove = [];
      for (const t of [active, ...ordered().filter((t) => t !== active)]) {
        if (!t?.url) continue;
        const key = JSON.stringify([t.private, t.url]);
        if (seen.has(key) && !t.pinned) remove.push(t.id);
        else seen.add(key);
      }
      remove.forEach(c.closeTab);
      c.publish();
      return `${remove.length} duplicate tab${remove.length === 1 ? "" : "s"} closed.`;
    },
    soloAudio: async () => {
      if (solo) {
        for (const [id, muted] of solo)
          if (c.tabs.has(id)) {
            c.tabs.get(id).muted = muted;
            c.applyVolume(c.tabs.get(id));
          }
        solo = null;
      } else {
        solo = new Map();
        for (const t of c.tabs.values())
          if (t.id !== c.current()?.id) {
            solo.set(t.id, t.muted);
            t.muted = true;
            c.applyVolume(t);
          }
      }
      c.publish();
      return solo
        ? "Other tabs muted. Run again to restore."
        : "Previous mute settings restored.";
    },
    reloadAll: async () => {
      let count = 0;
      for (const t of c.tabs.values())
        if (t.url) {
          t.view.webContents.reload();
          count++;
        }
      return `${count} pages reloading.`;
    },
    saveOffline: async () => {
      const t = current(),
        wc = t.view.webContents;
      const r = await dialog.showSaveDialog(c.win(), {
        title: "Save an offline page",
        defaultPath: "AltSeende-page.mhtml",
        filters: [{ name: "Web archive", extensions: ["mhtml"] }],
      });
      if (r.canceled) return "Cancelled.";
      await wc.savePage(r.filePath, "MHTML");
      return "Offline archive saved. Open it in a browser that supports MHTML.";
    },
    bookmarkAll: async () => {
      const s = c.settings();
      let count = 0;
      for (const t of c.tabs.values())
        if (t.url && !t.private && !s.bookmarks.some((b) => b.url === t.url)) {
          s.bookmarks.push({
            id: crypto.randomUUID(),
            title: t.title,
            url: t.url,
          });
          count++;
        }
      c.save();
      c.publish();
      return `${count} regular pages bookmarked.`;
    },
    siteInfo: async () => {
      const t = current(),
        u = new URL(t.url),
        wc = t.view.webContents;
      return {
        url: u.href,
        origin: u.origin,
        host: u.hostname,
        encrypted: u.protocol === "https:",
        private: t.private,
        zoom: Math.round(wc.getZoomFactor() * 100),
        blocker: c.settings().trackers,
        tunnel: c.state().network.mode,
      };
    },
    clearSite: async (origin) => {
      const t = current(),
        u = new URL(t.url);
      if (u.origin !== origin)
        throw Error("The page changed. Open site controls again.");
      const result = await dialog.showMessageBox(c.win(), {
        type: "question",
        buttons: ["Cancel", "Clear site data"],
        defaultId: 0,
        cancelId: 0,
        title: "Clear site data",
        message: `Sign out and clear stored data for ${u.origin}?`,
        detail:
          "Cookies shared with this host are removed. Other tabs on this site may need to be reloaded.",
      });
      if (result.response !== 1) return "Cancelled.";
      const ses = t.view.webContents.session;
      await ses.clearStorageData({
        origin: u.origin,
        storages: ["localstorage", "indexdb", "serviceworkers", "cachestorage"],
      });
      const cookies = await ses.cookies.get({ domain: u.hostname });
      for (const cookie of cookies) {
        const host = cookie.domain.replace(/^\./, "");
        if (u.hostname !== host && !u.hostname.endsWith("." + host)) continue;
        await ses.cookies.remove(
          `${cookie.secure ? "https" : "http"}://${host}${cookie.path}`,
          cookie.name,
        );
      }
      return "Site data cleared. Reload to sign in again.";
    },
  };
};
