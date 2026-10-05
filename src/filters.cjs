const fs = require("node:fs");
const path = require("node:path");
const { FiltersEngine, Request } = require("@ghostery/adblocker");
const lists = [
  ["EasyList", "https://easylist.to/easylist/easylist.txt"],
  ["EasyPrivacy", "https://easylist.to/easylist/easyprivacy.txt"],
  ["RU AdList", "https://easylist-downloads.adblockplus.org/advblock.txt"],
];
async function updateFilters(directory) {
  const texts = await Promise.all(
    lists.map(async ([name, url]) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
      const text = await response.text();
      if (text.length < 1000 || !text.includes("[Adblock"))
        throw Error(`Invalid ${name} list`);
      return text;
    }),
  );
  const engine = FiltersEngine.parse(texts.join("\n"), {
    enableCompression: true,
    loadCosmeticFilters: true,
  });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "engine.bin.tmp"), engine.serialize());
  fs.renameSync(
    path.join(directory, "engine.bin.tmp"),
    path.join(directory, "engine.bin"),
  );
  const info = {
    updated: new Date().toISOString(),
    lists: lists.map(([name, url]) => ({ name, url })),
  };
  fs.writeFileSync(
    path.join(directory, "info.json"),
    JSON.stringify(info, null, 2),
  );
  // Preserve upstream license headers and full source alongside the compiled rules.
  texts.forEach((text, i) =>
    fs.writeFileSync(
      path.join(directory, `${lists[i][0].replaceAll(" ", "-")}.txt`),
      text,
    ),
  );
  return { engine, info };
}
function loadFilters(directories) {
  for (const directory of directories) {
    try {
      return {
        engine: FiltersEngine.deserialize(
          fs.readFileSync(path.join(directory, "engine.bin")),
        ),
        info: JSON.parse(
          fs.readFileSync(path.join(directory, "info.json"), "utf8"),
        ),
      };
    } catch {}
  }
  return { engine: null, info: { updated: null, lists: [] } };
}
module.exports = { updateFilters, loadFilters, Request };
if (require.main === module)
  updateFilters(path.join(__dirname, "../assets/filters"))
    .then((r) => console.log("Bundled filter lists:", r.info))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
