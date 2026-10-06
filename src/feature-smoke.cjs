const assert = require("node:assert/strict");
const http = require("node:http"),
  net = require("node:net");
const fs = require("node:fs"),
  path = require("node:path");
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
  tabs,
  current,
  newTab,
  command,
  state,
  features,
  server,
}) => {
  const url = `http://127.0.0.1:${server.address().port}/login`;
  const t = newTab(url);
  await until(() => !t.view.webContents.isLoading(), "fixture load");
  await command("overlay", true);
  assert.ok(t.view.getVisible(), "Page stays visible alongside sheet");
  assert.ok(t.view.getBounds().width < win.getContentSize()[0] - 400);
  await win.webContents.executeJavaScript("showPanel('settings')");
  const size = await win.webContents.executeJavaScript(
    "({panel:document.querySelector('#panel').getBoundingClientRect().width,window:innerWidth})",
  );
  assert.ok(size.panel < size.window / 2);
  const { Menu, dialog } = require("electron");
  const build = Menu.buildFromTemplate;
  let quick;
  try {
    Menu.buildFromTemplate = (template) => {
      quick = template;
      return { popup() {} };
    };
    await command("quickSplit");
  } finally {
    Menu.buildFromTemplate = build;
  }
  quick.find((x) => x.label === "Show 6 pages").click();
  assert.equal(state().split.length, 6);
  quick.find((x) => x.label === "2 columns").click();
  assert.equal(new Set(state().panes.map((p) => p.x)).size, 2);
  quick.find((x) => x.label === "Single page").click();
  assert.equal(state().split.length, 0);
  await command("activate", t.id);
  const file = path.join(app.getPath("userData"), "bookmarks-export-test.json");
  const originalSave = dialog.showSaveDialog,
    originalOpen = dialog.showOpenDialog;
  try {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    await command("bookmarkAdd");
    await command("bookmarksExport");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(saved.some((b) => b.url === url));
    const before = state().settings.bookmarks.length;
    await command("bookmarksImport");
    assert.equal(state().settings.bookmarks.length, before);
    fs.writeFileSync(file, JSON.stringify([{ url: "javascript:alert(1)" }]));
    await assert.rejects(() => command("bookmarksImport"));
  } finally {
    dialog.showSaveDialog = originalSave;
    dialog.showOpenDialog = originalOpen;
  }
  await command("vaultUnlock", "smoke master password");
  await command("vaultSave", {
    origin: new URL(url).origin,
    username: "reader",
    password: "fixture-secret",
  });
  const entry = (await command("vaultList"))[0];
  assert.equal(entry.password, undefined);
  await t.view.webContents.executeJavaScript(
    "document.body.insertAdjacentHTML('beforeend','<form><input name=login><input type=password></form>')",
  );
  await command("vaultFill", entry.id);
  assert.equal(
    await t.view.webContents.executeJavaScript(
      "document.querySelector('input[type=password]').value",
    ),
    "fixture-secret",
  );
  const other = newTab("http://localhost:" + server.address().port + "/login");
  await until(() => !other.view.webContents.isLoading(), "other origin");
  await assert.rejects(
    () => command("vaultFill", entry.id),
    /exact saved site/,
  );
  await command("activate", t.id);
  assert.match(await command("qr"), /^data:image\/png;base64,/);
  await command("dark");
  await until(
    () =>
      t.view.webContents.executeJavaScript(
        "!!document.querySelector('style.darkreader')",
      ),
    "Dark Reader not applied",
  );
  await command("dark");
  await until(
    () =>
      t.view.webContents.executeJavaScript(
        "!document.querySelector('style.darkreader')",
      ),
    "Dark Reader not removed",
  );
  await command("pin");
  assert.equal(state().tabs.find((x) => x.id === t.id).pinned, true);
  await command("noteSave", "Fixture note");
  assert.equal(state().settings.notes[url], "Fixture note");
  await command("readingAdd");
  assert.ok(state().settings.readingList.some((x) => x.url === url));
  await command("duplicate");
  const duplicate = current();
  assert.equal(duplicate.url, url);
  await command("close", duplicate.id);
  await command("reopen");
  assert.equal(current().url, url);
  assert.ok((await command("history")).some((x) => x.url === url));
  await command("activate", t.id);
  // A real HTTP proxy fixture sits behind the bundled core. No external VPN credentials are needed.
  let requests = 0;
  const sockets = new Set();
  const proxy = http.createServer((req, res) => {
    requests++;
    res.setHeader("content-type", "text/plain");
    res.end("through-tunnel");
  });
  proxy.on("connect", (req, socket, head) => {
    requests++;
    const [host, port] = req.url.split(":");
    const upstream = net.connect(Number(port), host, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
  });
  proxy.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  try {
    await command(
      "networkImport",
      `http://127.0.0.1:${proxy.address().port}#Smoke`,
    );
    const p = (await command("networkProfiles"))[0];
    assert.equal(p.outbound, undefined);
    await command("networkConnect", p.id);
    assert.equal(state().network.mode, "connected");
    const answer = await t.view.webContents.session.fetch(url + "?tunnel=1");
    const text = await answer.text();
    assert.ok(requests > 0, "Traffic reached proxy");
    assert.ok(text.length > 0);
    features.tunnel.child.kill();
    await until(
      () => state().network.mode === "blocked",
      "Tunnel failure did not block",
    );
    await assert.rejects(() =>
      t.view.webContents.session.fetch(url + "?blocked=1"),
    );
    await command("networkDisconnect");
    assert.equal(state().network.mode, "direct");
    assert.equal(
      (await t.view.webContents.session.fetch(url + "?direct=1")).status,
      200,
    );
  } finally {
    await features.tunnel.disconnect();
    for (const s of sockets) s.destroy();
    proxy.close();
  }
  await command("portal");
  const { BrowserWindow } = require("electron");
  const portal = BrowserWindow.getAllWindows().find((w) => w !== win);
  assert.ok(portal);
  assert.equal(
    await portal.webContents.session.resolveProxy("https://example.com"),
    "DIRECT",
  );
  assert.equal(
    portal.webContents.getLastWebPreferences().nodeIntegration,
    false,
  );
  assert.equal(portal.webContents.getLastWebPreferences().sandbox, true);
  assert.notEqual(portal.webContents.session, t.view.webContents.session);
  portal.close();
  await command("vaultLock");
  await assert.rejects(() => command("vaultList"), /Unlock/);
  await win.webContents.executeJavaScript("showPanel('control')");
  await delay(300);
  const output = app.isPackaged
    ? app.getPath("userData")
    : path.join(__dirname, "../docs");
  const base = (await win.webContents.capturePage()).toDataURL(),
    page = (await t.view.webContents.capturePage()).toDataURL(),
    bounds = t.view.getBounds();
  const composite = await win.webContents.executeJavaScript(
    `(async()=>{const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const base=await load(${JSON.stringify(base)});const canvas=document.createElement('canvas');canvas.width=base.width;canvas.height=base.height;const ctx=canvas.getContext('2d');ctx.drawImage(base,0,0);const scale=base.width/innerWidth,b=${JSON.stringify(bounds)};ctx.drawImage(await load(${JSON.stringify(page)}),b.x*scale,b.y*scale,b.width*scale,b.height*scale);return canvas.toDataURL('image/png');})()`,
  );
  fs.writeFileSync(
    path.join(output, "control-center.png"),
    Buffer.from(composite.split(",")[1], "base64"),
  );
  console.log(
    "FEATURE PASS: compact sheet, exact-origin password fill, encrypted vault, local QR, dark toggle, notes, reading list, pins, history, reopen, real proxy through bundled sing-box and fail-closed crash",
  );
};
