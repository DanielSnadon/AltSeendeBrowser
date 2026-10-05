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
    await delay(350);
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
      "SMOKE PASS: real pages, isolation, network/cosmetic blocker on/off, address, reader, video/image download, screenshot, split focus, private cookies, session restore, groups, presets, toolbar, settings",
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
