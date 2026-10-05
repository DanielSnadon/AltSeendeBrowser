const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, message) {
  for (let i = 0; i < 80; i++) {
    if (await fn()) return;
    await delay(100);
  }
  throw Error(message);
}
module.exports = async ({
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
}) => {
  let server,
    requests = 0;
  const timer = setTimeout(() => {
    console.error("SMOKE timeout");
    app.exit(1);
  }, 60000);
  try {
    const outputDir = app.isPackaged
      ? app.getPath("userData")
      : path.join(__dirname, "../docs");
    fs.mkdirSync(outputDir, { recursive: true });
    await delay(650);
    fs.writeFileSync(
      path.join(outputDir, "preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    server = http.createServer((req, res) => {
      if (req.url === "/adserver.js") {
        requests++;
        res.setHeader("Content-Type", "application/javascript");
        return res.end("window.adLoaded=true");
      }
      if (req.url === "/sample.mp4") {
        res.setHeader("Content-Type", "video/mp4");
        return res.end(Buffer.from("fixture-video-content"));
      }
      if (req.url === "/image.svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="green"/></svg>',
        );
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><title>Research page</title><style>body{background:#141719;color:#dde5dd;font:18px sans-serif;padding:40px}h1{font-size:32px}p{line-height:1.8}.adsbox-square{background:red;padding:30px}</style><h1>Research page</h1><p>Compare sources in a focused workspace.</p><div class="adsbox-square">Advertisement fixture</div><script src="/adserver.js"></script><video src="/sample.mp4"></video><img src="/image.svg">',
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    await normal.setProxy({ mode: "direct" });
    await privateSession.setProxy({ mode: "direct" });
    await command("settings", { httpsOnly: false });
    const url = "http://altseende.test:" + server.address().port + "/";
    const t = newTab(url);
    await until(() => t.title === "Research page", "Page failed to load");
    for (const symbol of ["process", "require", "window.alt"])
      assert.equal(
        await t.view.webContents.executeJavaScript("typeof " + symbol),
        "undefined",
      );
    await until(
      async () =>
        (await t.view.webContents.executeJavaScript(
          "getComputedStyle(document.querySelector('.adsbox-square')).display",
        )) === "none",
      "Cosmetic filter was not applied",
    );
    assert.equal(requests, 0, "Ad request reached server with blocker on");
    await command("settings", { trackers: false });
    await until(
      () => requests > 0,
      "Disabling blocker did not restore ad request",
    );
    await until(
      async () =>
        (await t.view.webContents.executeJavaScript(
          "getComputedStyle(document.querySelector('.adsbox-square')).display",
        )) !== "none",
      "Ad stays hidden with blocker off",
    );
    await command("settings", { trackers: true });
    await until(
      async () => !t.view.webContents.isLoading(),
      "Reload did not finish",
    );
    await win.webContents.executeJavaScript(
      "document.querySelector('#address').focus();document.querySelector('#address').value='a stale search'",
    );
    await command("navigate", url + "?next=1");
    await until(
      async () =>
        (await win.webContents.executeJavaScript(
          "document.querySelector('#address').value",
        )) ===
        url + "?next=1",
      "Address bar stale after navigation",
    );
    await until(
      () => !t.view.webContents.isLoading(),
      "Navigation did not finish",
    );
    await command("read");
    await until(
      async () =>
        /Research page/.test(
          await win.webContents.executeJavaScript(
            "document.querySelector('#reader-text')?.value || ''",
          ),
        ),
      "Reader text not populated",
    );
    await command("overlay", false);
    const media = await command("media");
    assert.ok(media.some((u) => u.endsWith("/sample.mp4")));
    const downloadPath = path.join(app.getPath("userData"), "test-video.mp4");
    normal.once("will-download", (_e, item) => item.setSavePath(downloadPath));
    await command("download", url + "sample.mp4");
    await until(
      () =>
        fs.existsSync(downloadPath) &&
        state().downloads[0]?.state === "completed",
      "Download did not complete",
    );
    assert.equal(
      fs.readFileSync(downloadPath, "utf8"),
      "fixture-video-content",
    );
    const imgPath = path.join(app.getPath("userData"), "test-image.svg");
    normal.once("will-download", (_e, item) => item.setSavePath(imgPath));
    t.view.webContents.downloadURL(url + "image.svg");
    await until(() => fs.existsSync(imgPath), "Image download failed");
    await normal.cookies.set({ url, name: "regular", value: "yes" });
    assert.equal((await privateSession.cookies.get({ url })).length, 0);
    await command("volume", { id: t.id, volume: 0.35 });
    await until(
      async () =>
        Math.abs(
          (await t.view.webContents.executeJavaScript(
            "document.querySelector('video').volume",
          )) - 0.35,
        ) < 0.001,
      "Tab volume not applied",
    );
    await t.view.webContents.executeJavaScript(
      `{ const f=document.createElement('iframe'); f.srcdoc='<video></video>';document.body.append(f); }`,
    );
    await until(async () => {
      const frame = t.view.webContents.mainFrame.frames.find(
        (f) => f.url === "about:srcdoc",
      );
      return (
        frame &&
        Math.abs(
          (await frame.executeJavaScript(
            "document.querySelector('video').volume",
          )) - 0.35,
        ) < 0.001
      );
    }, "Iframe volume not applied");
    await t.view.webContents.executeJavaScript(
      "document.body.append(document.createElement('audio'))",
    );
    await until(
      async () =>
        Math.abs(
          (await t.view.webContents.executeJavaScript(
            "document.querySelector('audio').volume",
          )) - 0.35,
        ) < 0.001,
      "Dynamic media volume not applied",
    );
    await command("volume", { id: t.id, muted: true });
    assert.equal(t.view.webContents.isAudioMuted(), true);
    await command("volume", { id: t.id, muted: false });
    assert.equal(t.view.webContents.isAudioMuted(), false);
    await command("zoom", 1.2);
    assert.ok(Math.abs(t.view.webContents.getZoomFactor() - 1.2) < 0.01);
    await command("zoom", 1);
    const found = new Promise((resolve) =>
      t.view.webContents.once("found-in-page", (_e, r) => resolve(r)),
    );
    await command("find", { text: "Research" });
    const result = await Promise.race([
      found,
      delay(5000).then(() => {
        throw Error("Find request timed out");
      }),
    ]);
    assert.ok(result.matches > 0);
    await command("find", { text: "" });
    await command("bookmarkAdd");
    assert.ok(state().settings.bookmarks.some((b) => b.url === t.url));
    const pdf = await t.view.webContents.printToPDF({});
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const second = newTab(url + "?second"),
      third = newTab(url + "?third");
    await command("group", {
      ids: [t.id, second.id, third.id],
      create: true,
      name: "Research",
    });
    await command("split", [t.id, second.id, third.id]);
    assert.equal(state().split.length, 3);
    for (const id of state().split)
      assert.equal(tabs.get(id).view.getVisible(), true);
    await until(
      () => !second.view.webContents.isLoading(),
      "Second page did not load",
    );
    assert.equal(
      await second.view.webContents.executeJavaScript(
        "document.querySelector('video').volume",
      ),
      1,
    );
    await command("volume", { id: second.id, volume: 0.7 });
    assert.equal(state().tabs.find((x) => x.id === t.id).volume, 0.35);
    await command("activate", second.id);
    assert.equal(state().active, second.id);
    assert.equal(state().split.length, 3);
    await until(
      () =>
        [t, second, third].every((tab) => !tab.view.webContents.isLoading()),
      "Split pages are still loading",
    );
    await command("activate", second.id);
    await delay(250);
    const extra = [
      newTab(url + "?four"),
      newTab(url + "?five"),
      newTab(url + "?six"),
    ];
    await until(
      () => extra.every((x) => !x.view.webContents.isLoading()),
      "Extra split pages did not load",
    );
    await command("split", [
      t.id,
      second.id,
      third.id,
      ...extra.map((x) => x.id),
    ]);
    assert.equal(state().panes.length, 6);
    await delay(300);
    const shellImage = (await win.webContents.capturePage()).toDataURL();
    const captures = [];
    for (const p of state().panes)
      captures.push({
        ...p,
        image: (
          await tabs.get(p.id).view.webContents.capturePage()
        ).toDataURL(),
      });
    const composite = await win.webContents.executeJavaScript(`(async () => {
      const load = src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.src = src; });
      const base = await load(${JSON.stringify(shellImage)});
      const canvas = document.createElement('canvas'); canvas.width = base.width; canvas.height = base.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(base, 0, 0);
      const scale = base.width / innerWidth;
      for (const p of ${JSON.stringify(captures)}) ctx.drawImage(await load(p.image), p.x * scale, (p.y + 30) * scale, p.width * scale, (p.height - 30) * scale);
      return canvas.toDataURL('image/png');
    })()`);
    fs.writeFileSync(
      path.join(outputDir, "split-view.png"),
      Buffer.from(composite.split(",")[1], "base64"),
    );
    assert.ok(
      !(await second.view.webContents.capturePage()).isEmpty(),
      "Page screenshot is empty",
    );
    const priv = newTab(url + "?private", true);
    persistSession();
    const saved = JSON.parse(fs.readFileSync(profileFile("session"), "utf8"));
    assert.ok(!saved.tabs.some((x) => x.url.includes("private")));
    closeTab(priv.id);
    await command("split", [t.id, second.id, third.id]);
    persistSession();
    const finalSaved = JSON.parse(
      fs.readFileSync(profileFile("session"), "utf8"),
    );
    const before = tabs.size;
    restoreSession(finalSaved);
    assert.equal(tabs.size, before + finalSaved.tabs.length);
    assert.equal(state().split.length, 3);
    assert.equal(
      current().group,
      finalSaved.tabs.find((x) => x.id === finalSaved.active).group,
    );
    await command("presetSave", {
      name: "Fixture space",
      urls: [url, url + "?preset"],
      split: true,
    });
    const preset = state().settings.presets.find(
      (p) => p.name === "Fixture space",
    );
    await command("presetOpen", preset.id);
    assert.equal(state().split.length, 2);
    await win.webContents.executeJavaScript(
      "document.querySelector('#tools button[title=\"Multi-search\"]').click()",
    );
    await until(
      async () =>
        await win.webContents.executeJavaScript(
          "document.querySelector('#panel-body [name=text]')!==null",
        ),
      "Search form did not open",
    );
    const countBeforeSearch = tabs.size;
    await win.webContents.executeJavaScript(
      "document.querySelector('#panel-body [name=text]').value='precise query';document.querySelector('#panel-body form').requestSubmit()",
    );
    await until(
      () => state().split.length === 6 && tabs.size === countBeforeSearch + 6,
      "Advanced search did not open six panes",
    );
    const resultTabs = state().tabs.filter((x) => state().split.includes(x.id));
    assert.equal(
      new Set(resultTabs.map((x) => new URL(x.url).hostname)).size,
      6,
    );
    assert.equal(new Set(resultTabs.map((x) => x.group)).size, 1);
    for (const item of resultTabs) closeTab(item.id);
    await command("settings", { motion: false });
    await until(
      async () =>
        await win.webContents.executeJavaScript(
          "document.body.classList.contains('no-motion')",
        ),
      "Reduced motion was not rendered",
    );
    await command("settings", { motion: true });
    await command("settings", {
      tools: ["speed", "downloads", "screenshot"],
      homeTitle: "A focused start",
    });
    await delay(150);
    assert.equal(
      await win.webContents.executeJavaScript(
        "document.querySelector('#tools button').title",
      ),
      "Connection speed",
    );
    await command("settings", {
      tools: ["search", "split", "downloads", "screenshot", "speed", "reader"],
      homeTitle: "Start here.",
    });
    await win.webContents.executeJavaScript(
      "document.querySelector('#settings').click()",
    );
    await until(
      async () =>
        (await win.webContents.executeJavaScript(
          "document.querySelector('#panel-title').textContent",
        )) === "Preferences",
      "Settings panel failed",
    );
    await assert.rejects(() => command("navigate", "file:///etc/passwd"));
    console.log(
      "SMOKE PASS: real pages, isolation, network/cosmetic blocker on/off, address, reader, video/image download, screenshot, split focus, private cookies, session restore, groups, presets, toolbar, six-engine advanced search, independent and iframe audio, zoom, find, bookmarks, PDF, motion settings",
    );
    clearTimeout(timer);
    server.close();
    app.exit(0);
  } catch (e) {
    console.error(e);
    clearTimeout(timer);
    server?.close();
    app.exit(1);
  }
};
