const assert = require("node:assert/strict");
module.exports = async ({ phase, app, state, newTab, command }) => {
  try {
    if (phase === "seed") {
      const a = newTab("http://127.0.0.1:9/restore-a");
      const b = newTab("http://127.0.0.1:9/restore-b");
      newTab("http://127.0.0.1:9/private-secret", true);
      await command("group", {
        ids: [a.id, b.id],
        create: true,
        name: "Restart group",
      });
      await command("split", [a.id, b.id]);
      await command("activate", b.id);
      await command("settings", {
        tools: ["downloads", "screenshot"],
        homeTitle: "Restored home",
        gestures: false,
        passwordSuggestions: false,
      });
      await command("volume", { id: a.id, volume: 0.3, muted: true });
      await command("volume", { id: b.id, volume: 0.7 });
      await command("pin");
      await command("vaultUnlock", "restart master password");
      await command("vaultSave", {
        origin: "https://example.com",
        username: "restart",
        password: "encrypted secret",
      });
      await command("networkImport", "socks5://127.0.0.1:9#Restart");
      const profile = (await command("networkProfiles"))[0];
      await command("networkConnect", profile.id);
      app.quit();
    } else {
      const s = state();
      assert.equal(s.tabs.filter((t) => t.url.includes("restore-")).length, 2);
      assert.ok(
        s.tabs.every((t) => !t.private && !t.url.includes("private-secret")),
      );
      assert.equal(s.split.length, 2);
      assert.equal(
        s.tabs.find((t) => t.url.endsWith("/restore-b")).pinned,
        true,
      );
      assert.equal(s.network.mode, "blocked");
      assert.equal((await command("vaultStatus")).unlocked, false);
      await command("vaultUnlock", "restart master password");
      assert.equal((await command("vaultList"))[0].username, "restart");
      assert.equal((await command("networkProfiles"))[0].name, "Restart");
      assert.ok(
        s.tabs.find((t) => t.id === s.active).url.endsWith("/restore-b"),
      );
      assert.ok(s.settings.groups.some((g) => g.name === "Restart group"));
      assert.deepEqual(s.settings.tools, ["downloads", "screenshot"]);
      assert.equal(s.settings.homeTitle, "Restored home");
      assert.equal(s.settings.gestures, false);
      assert.equal(s.settings.passwordSuggestions, false);
      assert.equal(
        s.tabs.find((t) => t.url.endsWith("/restore-a")).volume,
        0.3,
      );
      assert.equal(
        s.tabs.find((t) => t.url.endsWith("/restore-a")).muted,
        true,
      );
      assert.equal(
        s.tabs.find((t) => t.url.endsWith("/restore-b")).volume,
        0.7,
      );
      console.log(
        "RESTART PASS: tabs, active pane, split layout, groups, home and toolbar survive a full application restart; private tabs excluded",
      );
      app.quit();
    }
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
};
