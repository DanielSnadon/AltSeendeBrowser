// This isolated preload exposes no API to websites. IPC is restricted to page helpers.
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

// All page helpers stay in the isolated preload. Websites get no privileged API.
let pageOptions = { gestures: false, passwordSuggestions: false };
ipcRenderer
  .invoke("page-options")
  .then((v) => (pageOptions = v))
  .catch(() => {});
ipcRenderer.on("page-options", (_e, v) => (pageOptions = v));
let loginTarget = null,
  loginToken = null,
  lastOffer = 0;
const visible = (e) =>
  e instanceof HTMLInputElement &&
  e.isConnected &&
  !e.disabled &&
  !e.readOnly &&
  e.getClientRects().length > 0 &&
  getComputedStyle(e).visibility !== "hidden";
function passwordFor(target) {
  const root = target?.form || document;
  return [...root.querySelectorAll("input[type=password]")].find(visible);
}
function offerLogin(e) {
  if (!e.isTrusted || !pageOptions.passwordSuggestions || window.top !== window)
    return;
  const target = e.target;
  if (
    !visible(target) ||
    !["text", "email", "password"].includes(target.type) ||
    !passwordFor(target)
  )
    return;
  if (
    target.type === "text" &&
    !target.form &&
    target.autocomplete !== "username"
  )
    return;
  if (Date.now() - lastOffer < 500 && target === loginTarget) return;
  lastOffer = Date.now();
  loginTarget = target;
  loginToken = crypto.randomUUID();
  ipcRenderer.send("password-focus", { token: loginToken });
}
document.addEventListener("focusin", offerLogin, true);
document.addEventListener("click", offerLogin, true);
ipcRenderer.on("credential-fill", (_e, d) => {
  let ok = false;
  try {
    if (
      location.origin !== d.origin ||
      location.href !== d.url ||
      window.top !== window
    )
      throw Error("Navigation changed");
    if (d.token && (d.token !== loginToken || !visible(loginTarget)))
      throw Error("Field changed");
    const target = d.token
      ? loginTarget
      : visible(document.activeElement)
        ? document.activeElement
        : null;
    const password = passwordFor(target);
    if (!password) throw Error("No password field");
    const root = password.form || document,
      fields = [...root.querySelectorAll("input")].filter(visible);
    const user =
      fields.find((x) => x.autocomplete === "username") ||
      fields.find((x) => ["email", "text"].includes(x.type));
    const set = (e, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(e, value);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    };
    if (user) set(user, d.username);
    set(password, d.password);
    ok = true;
  } catch {}
  ipcRenderer.send("credentials-filled", { request: d.request, ok });
});
function canScrollX(target, delta) {
  for (
    let e = target instanceof Element ? target : null;
    e;
    e = e.parentElement
  ) {
    const style = getComputedStyle(e);
    if (
      e.scrollWidth > e.clientWidth + 2 &&
      ["auto", "scroll"].includes(style.overflowX) &&
      ((delta < 0 && e.scrollLeft > 0) ||
        (delta > 0 && e.scrollLeft + e.clientWidth < e.scrollWidth - 2))
    )
      return true;
  }
  return false;
}
const editable = (e) =>
  e instanceof Element &&
  !!e.closest("input,textarea,select,[contenteditable=true],video,audio");
let wheel = null,
  wheelTimer,
  touch = null;
window.addEventListener(
  "wheel",
  (e) => {
    if (
      !e.isTrusted ||
      !pageOptions.gestures ||
      window.top !== window ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.shiftKey ||
      editable(e.target)
    )
      return;
    if (!wheel)
      wheel = {
        x: 0,
        y: 0,
        blocked: canScrollX(e.target, e.deltaX),
        fired: false,
      };
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheel = null;
    }, 220);
    wheel.x += e.deltaX * (e.deltaMode === 1 ? 16 : 1);
    wheel.y += Math.abs(e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
    if (
      !wheel.blocked &&
      !wheel.fired &&
      Math.abs(wheel.x) > 150 &&
      Math.abs(wheel.x) > wheel.y * 2
    ) {
      wheel.fired = true;
      ipcRenderer.send("history-gesture", wheel.x < 0 ? "back" : "forward");
    }
  },
  { passive: true },
);
window.addEventListener(
  "touchstart",
  (e) => {
    if (
      !e.isTrusted ||
      !pageOptions.gestures ||
      window.top !== window ||
      e.touches.length !== 1 ||
      editable(e.target)
    ) {
      touch = null;
      return;
    }
    const p = e.touches[0];
    touch = {
      x: p.clientX,
      y: p.clientY,
      target: e.target,
      scrollBack: canScrollX(e.target, -1),
      scrollForward: canScrollX(e.target, 1),
      time: Date.now(),
    };
  },
  { passive: true },
);
window.addEventListener(
  "touchend",
  (e) => {
    const start = touch;
    touch = null;
    if (
      !start ||
      !e.isTrusted ||
      !pageOptions.gestures ||
      !e.changedTouches.length ||
      Date.now() - start.time > 1000
    )
      return;
    const p = e.changedTouches[0],
      x = p.clientX - start.x,
      y = p.clientY - start.y;
    if (
      Math.abs(x) > 120 &&
      Math.abs(x) > Math.abs(y) * 2 &&
      !(x > 0 ? start.scrollBack : start.scrollForward)
    )
      ipcRenderer.send("history-gesture", x > 0 ? "back" : "forward");
  },
  { passive: true },
);
