// Runs only inside a web page, without Node or an application bridge.
function mediaVolume(level) {
  const key = Symbol.for("AltSeende.mediaVolume");
  if (window[key]) {
    window[key].set(level);
    return;
  }
  let factor = Math.max(0, Math.min(1, level));
  const records = new WeakMap();
  function apply(media) {
    let r = records.get(media);
    if (!r) {
      r = { base: media.volume, applied: media.volume };
      records.set(media, r);
    } else if (Math.abs(media.volume - r.applied) > 0.00001)
      r.base = media.volume;
    const value = Math.max(0, Math.min(1, r.base * factor));
    r.applied = value;
    if (Math.abs(media.volume - value) > 0.00001) media.volume = value;
  }
  function scan() {
    document.querySelectorAll("audio,video").forEach(apply);
  }
  document.addEventListener(
    "volumechange",
    (e) => {
      if (e.target instanceof HTMLMediaElement) apply(e.target);
    },
    true,
  );
  document.addEventListener(
    "play",
    (e) => {
      if (e.target instanceof HTMLMediaElement) apply(e.target);
    },
    true,
  );
  let pending = false;
  new MutationObserver(() => {
    if (!pending) {
      pending = true;
      queueMicrotask(() => {
        pending = false;
        scan();
      });
    }
  }).observe(document, { subtree: true, childList: true });
  window[key] = {
    set(value) {
      factor = Math.max(0, Math.min(1, value));
      scan();
    },
  };
  scan();
}
module.exports = (level) =>
  `(${mediaVolume.toString()})(${JSON.stringify(level)})`;
