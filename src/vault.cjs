const fs = require("node:fs");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const derive = promisify(crypto.scrypt);
class Vault {
  constructor(file) {
    this.file = file;
    this.key = null;
    this.data = null;
    this.timer = null;
  }
  status() {
    return { exists: fs.existsSync(this.file), unlocked: !!this.key };
  }
  async unlock(password) {
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 1024
    )
      throw Error("Use a master password of 12–1024 characters.");
    const exists = fs.existsSync(this.file);
    const envelope = exists
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : { salt: crypto.randomBytes(16).toString("base64") };
    const key = await derive(
      password,
      Buffer.from(envelope.salt, "base64"),
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    );
    let data = { passwords: [], profiles: [] };
    try {
      if (exists) {
        const cipher = crypto.createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(envelope.iv, "base64"),
        );
        cipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
        data = JSON.parse(
          Buffer.concat([
            cipher.update(Buffer.from(envelope.payload, "base64")),
            cipher.final(),
          ]).toString(),
        );
      }
    } catch {
      key.fill(0);
      throw Error("Wrong master password or damaged vault.");
    }
    this.lock();
    this.key = key;
    this.data = data;
    this.salt = envelope.salt;
    this.touch();
    if (!exists) this.save();
    return this.status();
  }
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.lock(), 5 * 60 * 1000);
    this.timer.unref();
  }
  require() {
    if (!this.key) throw Error("Unlock your vault first.");
    this.touch();
    return this.data;
  }
  save() {
    this.require();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const payload = Buffer.concat([
      cipher.update(JSON.stringify(this.data)),
      cipher.final(),
    ]);
    fs.writeFileSync(
      this.file + ".tmp",
      JSON.stringify({
        version: 1,
        salt: this.salt,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        payload: payload.toString("base64"),
      }),
      { mode: 0o600 },
    );
    fs.renameSync(this.file + ".tmp", this.file);
    fs.chmodSync(this.file, 0o600);
  }
  lock() {
    clearTimeout(this.timer);
    this.key?.fill(0);
    this.key = null;
    this.data = null;
  }
  list(kind) {
    return this.require()[kind].map(({ password, outbound, ...x }) => x);
  }
  put(kind, item) {
    const list = this.require()[kind];
    item.id ||= crypto.randomUUID();
    const i = list.findIndex((x) => x.id === item.id);
    if (i < 0) list.push(item);
    else list[i] = item;
    this.save();
    return item.id;
  }
  remove(kind, id) {
    this.require()[kind] = this.data[kind].filter((x) => x.id !== id);
    this.save();
  }
  get(kind, id) {
    const item = this.require()[kind].find((x) => x.id === id);
    if (!item) throw Error("Entry not found.");
    return item;
  }
}
module.exports = { Vault };
