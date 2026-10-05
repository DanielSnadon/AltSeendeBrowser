const { test } = require("node:test");
const assert = require("node:assert/strict");
const { snapshot, paneBounds } = require("../src/workspaces.cjs");
const { loadFilters, Request } = require("../src/filters.cjs");
test("saved session excludes private tabs and sanitizes unsafe URLs", () => {
  const saved = snapshot(
    [
      { id: 1, url: "https://example.org", group: "a" },
      { id: 2, url: "https://secret.test", private: true },
      { id: 3, url: "file:///etc/passwd" },
    ],
    2,
    [1, 2],
    [{ id: "a", name: "Research" }],
  );
  assert.deepEqual(
    saved.tabs.map((t) => t.id),
    [1, 3],
  );
  assert.equal(saved.tabs[1].url, "");
  assert.equal(saved.active, 3);
  assert.deepEqual(saved.split, [1]);
  assert.equal(saved.groups[0].name, "Research");
});
test("2 to 6 panes fit the window and never overlap", () => {
  for (let n = 2; n <= 6; n++) {
    const panes = paneBounds(
      Array.from({ length: n }, (_, i) => i),
      960,
      640,
    );
    for (const p of panes) {
      assert.ok(p.x >= 0 && p.y >= 58);
      assert.ok(p.x + p.width <= 960);
      assert.ok(p.y + p.height <= 588);
      assert.ok(p.width > 200 && p.height > 150);
    }
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const p = panes[a],
          q = panes[b];
        assert.ok(
          p.x + p.width <= q.x ||
            q.x + q.width <= p.x ||
            p.y + p.height <= q.y ||
            q.y + q.height <= p.y,
        );
      }
  }
});
test("bundled real lists block advertising requests and include cosmetic rules", () => {
  const { engine } = loadFilters([
    require("node:path").join(__dirname, "../assets/filters"),
  ]);
  assert.ok(engine, "Run npm run filters first");
  assert.equal(
    engine.match(
      Request.fromRawDetails({
        url: "https://googleads.g.doubleclick.net/pagead/ads",
        sourceUrl: "https://example.org",
        type: "script",
      }),
    ).match,
    true,
  );
  assert.equal(
    engine.match(
      Request.fromRawDetails({
        url: "https://example.org/article.js",
        sourceUrl: "https://example.org",
        type: "script",
      }),
    ).match,
    false,
  );
  assert.match(
    engine.getCosmeticsFilters({
      url: "https://example.org",
      hostname: "example.org",
      domain: "example.org",
      classes: ["adsbox-square"],
      getRulesFromDOM: true,
      getRulesFromHostname: true,
      getBaseRules: true,
    }).styles,
    /\.adsbox-square/,
  );
});
