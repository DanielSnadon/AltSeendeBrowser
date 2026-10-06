const net = require("node:net");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const b64 = (x) => Buffer.from(x, "base64url").toString("utf8");
function parseProfile(link) {
  link = String(link).trim();
  if (link.length > 16000) throw Error("Profile is too long.");
  let u, name, out;
  if (link.startsWith("vmess://")) {
    const v = JSON.parse(b64(link.slice(8)));
    name = v.ps;
    out = {
      type: "vmess",
      server: v.add,
      server_port: Number(v.port),
      uuid: v.id,
      security: v.scy || "auto",
      alter_id: Number(v.aid || 0),
    };
    u = new URL("vmess://example.com");
    for (const [k, val] of Object.entries({
      type: v.net,
      security: v.tls,
      sni: v.sni || v.host,
      host: v.host,
      path: v.path,
      serviceName: v.path,
    }))
      if (val) u.searchParams.set(k, val);
  } else {
    if (link.startsWith("ss://") && !link.split("#")[0].includes("@"))
      link =
        "ss://" +
        b64(link.slice(5).split("#")[0]) +
        (link.includes("#") ? "#" + link.split("#")[1] : "");
    u = new URL(link);
    name = decodeURIComponent(u.hash.slice(1));
    const type = {
      "vless:": "vless",
      "trojan:": "trojan",
      "ss:": "shadowsocks",
      "socks5:": "socks",
      "socks:": "socks",
      "http:": "http",
      "https:": "http",
    }[u.protocol];
    if (!type)
      throw Error(
        "Supported: VLESS, VMess, Trojan, Shadowsocks, SOCKS5, HTTP(S).",
      );
    out = {
      type,
      server: u.hostname.replace(/^\[|\]$/g, ""),
      server_port: Number(
        u.port ||
          (u.protocol === "https:" ? 443 : u.protocol === "http:" ? 80 : 0),
      ),
    };
    if (type === "vless") {
      out.uuid = decodeURIComponent(u.username);
      if (u.searchParams.get("flow")) out.flow = u.searchParams.get("flow");
    }
    if (type === "trojan") out.password = decodeURIComponent(u.username);
    if (type === "shadowsocks") {
      const raw = u.password
        ? decodeURIComponent(u.username) + ":" + decodeURIComponent(u.password)
        : b64(decodeURIComponent(u.username));
      const colon = raw.indexOf(":");
      if (colon < 1) throw Error("Invalid Shadowsocks credentials.");
      out.method = raw.slice(0, colon);
      out.password = raw.slice(colon + 1);
      if (u.searchParams.has("plugin"))
        throw Error(
          "Shadowsocks plugins are not supported. Use a local NekoBox SOCKS5 endpoint.",
        );
    }
    if (["socks", "http"].includes(type)) {
      if (u.username) out.username = decodeURIComponent(u.username);
      if (u.password) out.password = decodeURIComponent(u.password);
      if (type === "socks") out.version = "5";
    }
  }
  if (
    !out.server ||
    !Number.isInteger(out.server_port) ||
    out.server_port < 1 ||
    out.server_port > 65535
  )
    throw Error("Profile needs a server and valid port.");
  const p = u.searchParams,
    security = p.get("security");
  if (
    ["1", "true"].includes(p.get("allowInsecure")) ||
    ["1", "true"].includes(p.get("insecure"))
  )
    throw Error("Profiles must verify TLS certificates.");
  if (security && !["none", "tls", "reality"].includes(security))
    throw Error("Unsupported TLS mode.");
  if (
    security === "tls" ||
    security === "reality" ||
    out.type === "trojan" ||
    u.protocol === "https:"
  ) {
    out.tls = {
      enabled: true,
      server_name: p.get("sni") || p.get("peer") || out.server,
    };
    if (p.get("alpn")) out.tls.alpn = p.get("alpn").split(",");
    if (p.get("fp") || security === "reality")
      out.tls.utls = { enabled: true, fingerprint: p.get("fp") || "chrome" };
    if (security === "reality") {
      if (!p.get("pbk")) throw Error("REALITY public key is missing.");
      out.tls.reality = {
        enabled: true,
        public_key: p.get("pbk"),
        short_id: p.get("sid") || "",
      };
    }
  }
  const transport = p.get("type") || "tcp";
  if (transport === "ws")
    out.transport = {
      type: "ws",
      path: p.get("path") || "/",
      headers: p.get("host") ? { Host: p.get("host") } : {},
    };
  else if (transport === "grpc")
    out.transport = { type: "grpc", service_name: p.get("serviceName") || "" };
  else if (transport !== "tcp")
    throw Error(
      "Supported transports: TCP, WebSocket, gRPC. Use local NekoBox SOCKS5 for others.",
    );
  return {
    name: String(name || out.server).slice(0, 80),
    protocol: out.type,
    server: out.server,
    outbound: out,
  };
}
function configuration(outbound, port) {
  return {
    log: { disabled: true },
    inbounds: [
      { type: "mixed", tag: "browser", listen: "127.0.0.1", listen_port: port },
    ],
    outbounds: [{ ...outbound, tag: "tunnel" }],
    route: { final: "tunnel" },
  };
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
class Tunnel {
  constructor(binary, sessions, publish) {
    this.binary = binary;
    this.sessions = sessions;
    this.publish = publish;
    this.child = null;
    this.status = { mode: "direct", name: "", error: "" };
  }
  async proxy(port) {
    for (const s of this.sessions) {
      await s.setProxy({
        mode: "fixed_servers",
        proxyRules: `socks5://127.0.0.1:${port}`,
        proxyBypassRules: "<-loopback>",
      });
      await s.closeAllConnections();
    }
  }
  async connect(profile) {
    if (this.busy) throw Error("Connection change in progress.");
    this.busy = true;
    try {
      if (!fs.existsSync(this.binary)) {
        this.status.mode = "blocked";
        await this.proxy(9);
        throw Error(
          "Tunnel core missing. Reinstall the complete Linux package.",
        );
      }
      if (this.child) {
        const old = this.child;
        this.child = null;
        old.kill();
      }
      this.status = { mode: "connecting", name: profile.name, error: "" };
      this.publish();
      const port = await new Promise((resolve, reject) => {
        const s = net.createServer();
        s.on("error", reject);
        s.listen(0, "127.0.0.1", () => {
          const p = s.address().port;
          s.close(() => resolve(p));
        });
      });
      // Lock browser routing before startup. There is no DIRECT fallback.
      await this.proxy(port);
      const child = spawn(this.binary, ["run", "-c", "stdin"], {
        stdio: ["pipe", "ignore", "pipe"],
      });
      this.child = child;
      let stopped = false;
      child.on("error", () => {
        stopped = true;
      });
      child.stderr.resume();
      child.on("exit", () => {
        stopped = true;
        if (this.child === child) {
          this.child = null;
          this.status.mode = "blocked";
          this.status.error =
            "Tunnel stopped. Browsing stays blocked until reconnect or disconnect.";
          for (const s of this.sessions)
            s.closeAllConnections().catch(() => {});
          this.publish();
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(configuration(profile.outbound, port)));
      let ready = false;
      for (let i = 0; i < 80 && !stopped; i++) {
        ready = await new Promise((resolve) => {
          const s = net.connect(port, "127.0.0.1");
          s.setTimeout(100);
          s.once("connect", () => {
            s.destroy();
            resolve(true);
          });
          s.once("error", () => resolve(false));
          s.once("timeout", () => {
            s.destroy();
            resolve(false);
          });
        });
        if (ready) break;
        await delay(100);
      }
      if (!ready)
        throw Error(
          "Tunnel could not start. Check the profile and supported transport.",
        );
      this.status.mode = "connected";
      this.status.error = "";
      this.publish();
    } catch (e) {
      const child = this.child;
      this.child = null;
      child?.kill();
      if (this.status.mode !== "direct") {
        this.status.mode = "blocked";
        this.status.error = e.message;
      }
      this.publish();
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async disconnect() {
    if (this.busy) throw Error("Connection change in progress.");
    this.busy = true;
    try {
      const child = this.child;
      this.child = null;
      child?.kill();
      for (const s of this.sessions) {
        await s.setProxy({ mode: "direct" });
        await s.closeAllConnections();
      }
      this.status = { mode: "direct", name: "", error: "" };
      this.publish();
    } finally {
      this.busy = false;
    }
  }
  stop() {
    this.child?.kill();
    this.child = null;
  }
}
module.exports = { parseProfile, configuration, Tunnel };
