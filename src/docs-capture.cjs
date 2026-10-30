// Real Chromium screenshots of the application with local demonstration pages.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready(wc) {
  for (let i = 0; i < 100; i++) {
    if (!wc.isLoading()) return;
    await delay(80);
  }
  throw Error("Demo page timed out");
}
module.exports = async ({ app, win, newTab, tabs, command, state }) => {
  const directory = app.isPackaged
    ? app.getPath("userData")
    : path.join(__dirname, "../docs");
  fs.mkdirSync(directory, { recursive: true });
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    const login = req.url === "/login";
    const title = login
      ? "Welcome back"
      : req.url === "/notes"
        ? "Reading notes"
        : "A quieter workspace";
    res.end(
      `<!doctype html><html><head><title>${title}</title><meta name=viewport content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#151515;color:#dedede;font:15px system-ui,sans-serif}main{max-width:730px;padding:64px 38px;margin:auto}.eyebrow{font-size:11px;letter-spacing:2px;color:#808080;text-transform:uppercase}h1{font-size:36px;font-weight:400;letter-spacing:-1px;margin:24px 0}p{color:#aaa;line-height:1.9}hr{border:0;border-top:1px solid #333;margin:32px 0}form{max-width:370px;margin-top:32px}label{display:block;color:#999;font-size:12px;margin:20px 0}input{display:block;width:100%;background:#202020;border:1px solid #444;border-radius:7px;color:#eee;padding:13px;margin-top:8px;font:inherit}button{border:0;border-radius:7px;padding:12px 24px;color:#111;background:#ddd;margin-top:8px}.note{padding:22px;border:1px solid #333;border-radius:9px;margin-top:24px}small{color:#777}</style></head><body><main><div class=eyebrow>Local demonstration page</div><h1>${title}</h1>${login ? '<p>Choose your saved account in the browser bar.</p><form onsubmit="event.preventDefault()"><label>Email<input autocomplete=username type=email></label><label>Password<input autocomplete=current-password type=password></label><button>Sign in</button></form>' : "<p>A little room to think. Keep your sources together, compare ideas, and leave the rest out of sight.</p><hr><h2>One view. A clear focus.</h2><p>Use a split view when two sources belong together. Save a useful page, make a note, then carry on.</p><div class=note>Start small. Keep what matters.</div>"}<hr><small>Demo content for AltSeende documentation.</small></main></body></html>`,
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function capture(name) {
    await delay(500);
    const shell = (await win.webContents.capturePage()).toDataURL();
    const pages = [];
    for (const t of tabs.values())
      if (t.view.getVisible()) {
        const b = t.view.getBounds();
        const wc = t.view.webContents;
        await ready(wc);
        const shot = await wc.capturePage({
          x: 0,
          y: 0,
          width: b.width,
          height: b.height,
        });
        pages.push({ bounds: b, image: shot.toDataURL() });
      }
    const data = await win.webContents.executeJavaScript(
      `(async()=>{const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const base=await load(${JSON.stringify(shell)}),canvas=document.createElement('canvas');canvas.width=base.width;canvas.height=base.height;const ctx=canvas.getContext('2d');ctx.drawImage(base,0,0);const scale=base.width/innerWidth;for(const p of ${JSON.stringify(pages)}){const b=p.bounds;ctx.drawImage(await load(p.image),b.x*scale,b.y*scale,b.width*scale,b.height*scale);}return canvas.toDataURL('image/png');})()`,
    );
    fs.writeFileSync(
      path.join(directory, name),
      Buffer.from(data.split(",")[1], "base64"),
    );
  }
  try {
    await command("settings", {
      tools: [
        "search",
        "split",
        "bookmarks",
        "vault",
        "network",
        "dark",
        "palette",
      ],
      homeTitle: "Start here.",
      trackers: true,
    });
    await command("overlay", false);
    await capture("preview.png");
    const article = newTab(base + "/article");
    await ready(article.view.webContents);
    await win.webContents.executeJavaScript("showPanel('control')");
    await capture("control-center.png");
    await command("overlay", false);
    const notes = newTab(base + "/notes");
    await ready(notes.view.webContents);
    await command("split", [article.id, notes.id]);
    await capture("split-view.png");
    const login = newTab(base + "/login");
    await ready(login.view.webContents);
    await command("vaultUnlock", "documentation demo master");
    await command("vaultSave", {
      origin: base,
      username: "alex@example.com",
      password: "documentation-only",
    });
    await command("vaultSave", {
      origin: base,
      username: "work@example.com",
      password: "documentation-only-two",
    });
    await login.view.webContents.executeJavaScript(
      "document.querySelector('input').focus()",
    );
    await capture("password-suggestions.png");
    console.log(
      "DOCS PASS: home, side controls, split view and account suggestions captured from Chromium.",
    );
    server.close();
    app.exit(0);
  } catch (e) {
    console.error(e);
    server.close();
    app.exit(1);
  }
};
