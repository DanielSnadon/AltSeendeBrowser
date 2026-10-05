const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "altseende-restart-"));
const executable = process.argv[2] || require("electron");
const appArgs = process.argv[2] ? [] : [path.resolve(__dirname, "..")];
try {
  for (const phase of ["seed", "verify"]) {
    const result = spawnSync(
      executable,
      [...appArgs, "--restart-smoke=" + phase],
      {
        env: { ...process.env, ALTSEENDE_TEST_PROFILE: profile },
        stdio: "inherit",
        timeout: 30000,
      },
    );
    if (result.status !== 0) {
      console.error(result.error || "Restart process failed");
      process.exitCode = 1;
      break;
    }
  }
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
