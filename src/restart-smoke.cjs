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
      });
      app.quit();
    } else {
      const s = state();
      assert.equal(s.tabs.filter((t) => t.url.includes("restore-")).length, 2);
      assert.ok(
        s.tabs.every((t) => !t.private && !t.url.includes("private-secret")),
      );
      assert.equal(s.split.length, 2);
      assert.ok(
        s.tabs.find((t) => t.id === s.active).url.endsWith("/restore-b"),
      );
      assert.ok(s.settings.groups.some((g) => g.name === "Restart group"));
      assert.deepEqual(s.settings.tools, ["downloads", "screenshot"]);
      assert.equal(s.settings.homeTitle, "Restored home");
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
