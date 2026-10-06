// Pinned upstream artifact. The digest comes from GitHub's release asset metadata.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
(async () => {
  const version = "1.14.2",
    sha = "a684484d7477d1437282ee411f4d131d0340aaad60a7868841ebd5d87dd8a0c6";
  const dest = path.join(__dirname, "../assets/tunnel");
  fs.mkdirSync(dest, { recursive: true });
  const archive = path.join(dest, "core.tar.gz");
  const r = await fetch(
    `https://github.com/SagerNet/sing-box/releases/download/v${version}/sing-box-${version}-linux-amd64.tar.gz`,
  );
  if (!r.ok) throw Error("Tunnel download failed");
  const bytes = Buffer.from(await r.arrayBuffer());
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== sha)
    throw Error("Tunnel checksum mismatch");
  fs.writeFileSync(archive, bytes);
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", dest]);
  fs.unlinkSync(archive);
  fs.chmodSync(path.join(dest, "sing-box"), 0o755);
  const source = await fetch(
    `https://github.com/SagerNet/sing-box/archive/refs/tags/v${version}.tar.gz`,
  );
  if (!source.ok) throw Error("Source archive download failed");
  fs.writeFileSync(
    path.join(dest, "sing-box-source.tar.gz"),
    Buffer.from(await source.arrayBuffer()),
  );
  const license = await fetch(
    `https://raw.githubusercontent.com/SagerNet/sing-box/v${version}/LICENSE`,
  );
  if (!license.ok) throw Error("License download failed");
  fs.writeFileSync(path.join(dest, "LICENSE"), await license.text());
  console.log("Pinned sing-box core, corresponding source and license ready.");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
