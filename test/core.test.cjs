const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  address,
  query,
  searchURL,
  blocked,
  defaults,
} = require("../src/core.cjs");
test("reject executable and local schemes", () => {
  for (const u of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,test",
    "chrome://settings",
  ])
    assert.throws(() => address(u));
});
test("HTTPS upgrades and loopback exceptions", () => {
  assert.equal(address("http://example.com/a"), "https://example.com/a");
  assert.equal(address("http://localhost:8123/"), "http://localhost:8123/");
  assert.equal(address("example.com"), "https://example.com/");
  assert.equal(
    address("http://example.com", { ...defaults, httpsOnly: false }),
    "http://example.com/",
  );
});
test("search input encoded without URL parameter injection", () => {
  assert.equal(
    new URL(searchURL("a & b #c", "Google")).searchParams.get("q"),
    "a & b #c",
  );
  assert.match(address("precise information"), /duckduckgo/);
});
test("compose advanced operators", () => {
  assert.equal(
    query({
      text: "climate",
      exact: "open data",
      exclude: "ads spam",
      site: "example.org",
      type: "pdf",
      after: "2024-01-01",
    }),
    'climate "open data" -ads -spam site:example.org filetype:pdf after:2024-01-01',
  );
});
test("tracker hostname boundaries", () => {
  assert.equal(blocked("a.doubleclick.net"), true);
  assert.equal(blocked("notdoubleclick.net"), false);
  assert.equal(blocked("doubleclick.net.evil.org"), false);
});
