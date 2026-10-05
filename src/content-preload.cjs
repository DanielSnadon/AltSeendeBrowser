// This isolated preload exposes no API to websites. Its only IPC asks for CSS filters.
const { ipcRenderer, webFrame } = require("electron");
let timer,
  previous = "",
  styleKey;
async function update() {
  try {
    const nodes = [...document.querySelectorAll("[id],[class]")].slice(0, 6000);
    const classes = [...new Set(nodes.flatMap((n) => [...n.classList]))].slice(
      0,
      8000,
    );
    const ids = [...new Set(nodes.map((n) => n.id).filter(Boolean))].slice(
      0,
      6000,
    );
    const css = await ipcRenderer.invoke("cosmetic-filters", { classes, ids });
    if (css === previous) return;
    if (styleKey) await webFrame.removeInsertedCSS(styleKey);
    previous = css;
    styleKey = css ? await webFrame.insertCSS(css) : undefined;
  } catch {}
}
window.addEventListener("DOMContentLoaded", () => {
  update();
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(update, 400);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["id", "class"],
  });
});
