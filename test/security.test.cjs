const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Vault } = require("../src/vault.cjs");
const { parseProfile, configuration } = require("../src/network.cjs");
test("vault encrypts secrets, rejects tampering and wrong keys; metadata omits credentials", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alt-vault-"));
  const file = path.join(dir, "vault.json"),
    v = new Vault(file);
  try {
    await v.unlock("correct master password");
    const id = v.put("passwords", {
      origin: "https://example.com",
      username: "test",
      password: "hidden-password",
    });
    assert.ok(!fs.readFileSync(file, "utf8").includes("hidden-password"));
    assert.equal(v.list("passwords")[0].password, undefined);
    v.lock();
    await assert.rejects(() => v.unlock("incorrect master password"));
    await v.unlock("correct master password");
    assert.equal(v.get("passwords", id).password, "hidden-password");
    v.lock();
    const data = JSON.parse(fs.readFileSync(file));
    data.tag = Buffer.alloc(16).toString("base64");
    fs.writeFileSync(file, JSON.stringify(data));
    await assert.rejects(() => v.unlock("correct master password"));
  } finally {
    v.lock();
    fs.rmSync(dir, { recursive: true });
  }
});
test("imports all six protocols and REALITY; rejects unknown transports and insecure TLS", () => {
  const v = parseProfile(
    "vless://123@server.example:443?security=reality&pbk=key&sid=ab&flow=xtls-rprx-vision#Test",
  );
  assert.equal(v.outbound.tls.reality.public_key, "key");
  assert.equal(v.name, "Test");
  const vm = Buffer.from(
    JSON.stringify({
      add: "example.com",
      port: 443,
      id: "uuid",
      tls: "tls",
      net: "ws",
      host: "host.test",
      path: "/ws",
    }),
  ).toString("base64");
  assert.equal(parseProfile("vmess://" + vm).outbound.transport.path, "/ws");
  for (const link of [
    "trojan://secret@host.test:443",
    "ss://" +
      Buffer.from("aes-128-gcm:secret").toString("base64") +
      "@host.test:443",
    "socks5://localhost:2080",
    "https://user:pass@host.test",
  ])
    assert.ok(parseProfile(link).outbound.server);
  assert.throws(() => parseProfile("vless://id@host.test:443?type=xhttp"));
  assert.throws(() =>
    parseProfile("trojan://id@host.test:443?allowInsecure=1"),
  );
  const config = configuration(v.outbound, 3000);
  assert.equal(config.inbounds[0].listen, "127.0.0.1");
  assert.equal(config.outbounds.length, 1);
  assert.equal(config.route.final, "tunnel");
});

const { safeOrigin } = require("../src/page-tools.cjs");
test("password origins require HTTPS or an explicit loopback HTTP origin", () => {
  assert.equal(safeOrigin("https://example.com/login"), "https://example.com");
  assert.equal(
    safeOrigin("http://127.0.0.1:8080/login"),
    "http://127.0.0.1:8080",
  );
  for (const url of [
    "http://example.com",
    "ftp://localhost",
    "file:///tmp/login",
    "https://",
    "http://127.0.0.1.attacker.test",
  ])
    assert.equal(safeOrigin(url), null);
});
test("suggestion metadata cannot expose secrets or extend vault inactivity timeout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alt-vault-meta-"));
  const v = new Vault(path.join(dir, "vault.json"));
  try {
    await v.unlock("metadata master password");
    v.put("passwords", {
      origin: "https://example.com",
      username: "demo",
      password: "do-not-publish",
    });
    const timer = v.timer;
    const meta = v.metadata("passwords");
    assert.equal(meta[0].password, undefined);
    assert.equal(v.timer, timer);
    v.lock();
    assert.deepEqual(v.metadata("passwords"), []);
  } finally {
    v.lock();
    fs.rmSync(dir, { recursive: true });
  }
});
