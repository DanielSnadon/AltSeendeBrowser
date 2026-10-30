const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { dialog } = require("electron");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, message) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await delay(80);
  }
  throw Error(message);
}
module.exports = async ({
  app,
  win,
  newTab,
  tabs,
  current,
  command,
  state,
  features,
}) => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><title>Workflow fixture</title><style>body{font:18px sans-serif;background:white;color:black;margin:40px}input{display:block;margin:20px;padding:10px}#scroll{width:300px;overflow-x:auto;height:60px}#scroll>div{width:1000px}</style><h1>Workflow fixture</h1><form><input name=username autocomplete=username><input type=password autocomplete=current-password></form><div id=scroll><div>Horizontal content</div></div><p>${req.url}</p>`,
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const load = async (url) => {
    await command("navigate", url);
    await until(() => !current().view.webContents.isLoading(), "Page load");
  };
  try {
    await command("vaultUnlock", "smoke master password");
    await command("vaultSave", {
      origin: base,
      username: "demo@altseende.test",
      password: "demo-only-secret",
    });
    const t = newTab(base + "/login");
    await until(() => !t.view.webContents.isLoading(), "Sign-in page");
    await delay(100);
    const wc = t.view.webContents;
    // Chromium input, not an untrusted DOM event, triggers the isolated preload.
    const point = await wc.executeJavaScript(
      "(()=>{const r=document.querySelector('input').getBoundingClientRect();return{x:Math.round(r.x+10),y:Math.round(r.y+10)}})()",
    );
    wc.focus();
    wc.sendInputEvent({
      type: "mouseDown",
      button: "left",
      clickCount: 1,
      ...point,
    });
    wc.sendInputEvent({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      ...point,
    });
    await until(
      () => state().passwordOffer?.entries.length === 1,
      "Automatic account suggestion missing",
    );
    const offer = state().passwordOffer;
    assert.equal(offer.entries[0].username, "demo@altseende.test");
    assert.ok(!JSON.stringify(offer).includes("demo-only-secret"));
    await until(
      () =>
        win.webContents.executeJavaScript(
          "!document.querySelector('#credential-bar').hidden",
        ),
      "Suggestion UI missing",
    );
    assert.equal(t.view.getBounds().y, 112);
    await command("passwordChoose", {
      id: offer.entries[0].id,
      token: offer.token,
    });
    assert.equal(
      await wc.executeJavaScript(
        "document.querySelector('[type=password]').value",
      ),
      "demo-only-secret",
    );
    assert.equal(state().passwordOffer, null);
    await command("vaultLock");
    await wc.executeJavaScript(
      "document.querySelector('[type=password]').focus()",
    );
    await until(
      () => state().passwordOffer?.locked,
      "Locked vault prompt missing",
    );
    assert.equal(state().passwordOffer.entries.length, 0);
    await command("vaultUnlock", "smoke master password");
    assert.equal(state().passwordOffer.entries.length, 1);
    const stale = state().passwordOffer;
    await load(base + "/second");
    await assert.rejects(
      () =>
        command("passwordChoose", {
          id: stale.entries[0].id,
          token: stale.token,
        }),
      /expired/,
    );
    assert.equal(
      await wc.executeJavaScript(
        "document.querySelector('[type=password]').value",
      ),
      "",
    );
    await command("settings", { passwordSuggestions: false });
    await wc.executeJavaScript("document.querySelector('input').focus()");
    await delay(150);
    assert.equal(state().passwordOffer, null);
    await command("settings", { passwordSuggestions: true });
    const priv = newTab(base + "/private", true);
    await until(() => !priv.view.webContents.isLoading(), "Private page");
    await priv.view.webContents.executeJavaScript(
      "document.querySelector('input').focus()",
    );
    await delay(150);
    assert.equal(state().passwordOffer, null);
    await command("activate", t.id);
    // Back/forward swipe, no navigation for vertical scroll or a scrollable carousel.
    await load(base + "/third");
    wc.focus();
    wc.sendInputEvent({
      type: "mouseWheel",
      x: 650,
      y: 450,
      deltaX: 220,
      deltaY: 0,
    });
    await until(() => wc.getURL() === base + "/second", "Back swipe failed");
    await delay(900);
    wc.sendInputEvent({
      type: "mouseWheel",
      x: 650,
      y: 450,
      deltaX: -220,
      deltaY: 0,
    });
    await until(() => wc.getURL() === base + "/third", "Forward swipe failed");
    await delay(900);
    wc.debugger.attach("1.3");
    try {
      await wc.debugger.sendCommand("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 500, y: 450 }],
      });
      await wc.debugger.sendCommand("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 700, y: 450 }],
      });
      await wc.debugger.sendCommand("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await until(
        () => wc.getURL() === base + "/second",
        "Touch back swipe failed",
      );
    } finally {
      wc.debugger.detach();
    }
    await load(base + "/third");
    await delay(900);
    await command("settings", { gestures: false });
    wc.sendInputEvent({
      type: "mouseWheel",
      x: 650,
      y: 450,
      deltaX: 220,
      deltaY: 0,
    });
    await delay(400);
    assert.equal(wc.getURL(), base + "/third");
    await command("settings", { gestures: true });
    await wc.executeJavaScript(
      "document.querySelector('#scroll').scrollLeft=200",
    );
    const scroll = await wc.executeJavaScript(
      "(()=>{const r=document.querySelector('#scroll').getBoundingClientRect();return{x:Math.round(r.x+100),y:Math.round(r.y+20)}})()",
    );
    wc.sendInputEvent({
      type: "mouseWheel",
      ...scroll,
      deltaX: 180,
      deltaY: 0,
    });
    await delay(350);
    assert.equal(wc.getURL(), base + "/third");
    wc.sendInputEvent({
      type: "mouseWheel",
      x: 650,
      y: 450,
      deltaX: 0,
      deltaY: 250,
    });
    await delay(350);
    assert.equal(wc.getURL(), base + "/third");
    // Main-window shortcuts work while the page has keyboard focus.
    wc.sendInputEvent({
      type: "keyDown",
      keyCode: "K",
      modifiers: ["control"],
    });
    await until(
      () =>
        win.webContents.executeJavaScript(
          "document.querySelector('#panel-title').textContent==='Command palette'",
        ),
      "Palette shortcut failed",
    );
    await win.webContents.executeJavaScript(
      "document.querySelector('[name=command]').value='offline';document.querySelector('[name=command]').dispatchEvent(new Event('input'))",
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        "document.querySelectorAll('.command-row').length",
      ),
      1,
    );
    await command("overlay", false);
    const before = state().active;
    wc.sendInputEvent({
      type: "keyDown",
      keyCode: "Tab",
      modifiers: ["control"],
    });
    await until(() => state().active !== before, "Tab switching failed");
    await command("activate", t.id);
    const saveDialog = dialog.showSaveDialog,
      confirmDialog = dialog.showMessageBox;
    const file = path.join(app.getPath("userData"), "offline-test.mhtml");
    try {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      await command("saveOffline");
      assert.match(fs.readFileSync(file, "utf8"), /multipart\/related/i);
      await wc.executeJavaScript(
        "localStorage.setItem('fixture','secret');document.cookie='fixture=1;path=/'",
      );
      const other = newTab(base.replace("127.0.0.1", "localhost") + "/other");
      await until(() => !other.view.webContents.isLoading(), "Other origin");
      await other.view.webContents.executeJavaScript(
        "localStorage.setItem('keep','yes')",
      );
      await command("activate", t.id);
      assert.equal((await command("siteInfo")).origin, base);
      dialog.showMessageBox = async () => ({ response: 1 });
      await command("clearSite", base);
      assert.equal(
        await wc.executeJavaScript("localStorage.getItem('fixture')"),
        null,
      );
      assert.equal(
        await wc.executeJavaScript("document.cookie.includes('fixture=')"),
        false,
      );
      assert.equal(
        await other.view.webContents.executeJavaScript(
          "localStorage.getItem('keep')",
        ),
        "yes",
      );
    } finally {
      dialog.showSaveDialog = saveDialog;
      dialog.showMessageBox = confirmDialog;
    }
    // Reduce to a controlled set and exercise batch operations without private/pinned loss.
    for (const x of [...tabs.values()])
      if (x.id !== t.id) await command("close", x.id);
    const b = newTab(base + "/b"),
      dup = newTab(base + "/third"),
      privateCopy = newTab(base + "/third", true);
    await command("activate", t.id);
    await command("pin");
    await command("deduplicate");
    assert.ok(!tabs.has(dup.id));
    assert.ok(tabs.has(privateCopy.id));
    assert.ok(tabs.has(t.id));
    await command("volume", { id: b.id, muted: false });
    await command("soloAudio");
    assert.equal(state().tabs.find((x) => x.id === b.id).muted, true);
    await command("soloAudio");
    assert.equal(state().tabs.find((x) => x.id === b.id).muted, false);
    await command("bookmarkAll");
    assert.ok(state().settings.bookmarks.some((x) => x.url === base + "/b"));
    await command("reloadAll");
    await until(
      () => [...tabs.values()].every((x) => !x.view.webContents.isLoading()),
      "Reload all",
    );
    await command("activate", b.id);
    await command("closeRight");
    assert.ok(tabs.has(t.id));
    assert.ok(!tabs.has(privateCopy.id));
    newTab(base + "/c");
    await command("activate", b.id);
    await command("closeOthers");
    assert.equal(tabs.size, 2);
    assert.ok(tabs.has(t.id));
    await command("vaultLock");
    console.log(
      "WORKFLOW PASS: trusted swipe input, scroll/disabled guards, automatic accounts, locked vault, stale-origin rejection, private exclusion, command palette, keyboard tabs, batch tabs/audio/bookmarks, offline archive and scoped site clearing",
    );
  } finally {
    server.close();
  }
};
