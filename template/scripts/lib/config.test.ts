import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  formatUserConfig,
  getUserConfigPath,
  loadUserConfig,
  resetUserConfig,
  updateUserConfig,
} from "./config.ts";

test("global user config loads, updates, clears stale model on provider switch, and resets", () => {
  const dir = mkdtempSync(join(tmpdir(), "gitcut-cfg-test-"));
  const env = { GITCUT_CONFIG: join(dir, "config.json") };
  try {
    assert.equal(getUserConfigPath(env), join(dir, "config.json"));
    assert.deepEqual(loadUserConfig(env), {});

    const u1 = updateUserConfig({ provider: "codex", model: "gpt-5.4" }, env);
    assert.equal(u1.config.provider, "codex");
    assert.equal(u1.config.model, "gpt-5.4");
    assert.deepEqual(loadUserConfig(env), { provider: "codex", model: "gpt-5.4" });

    // Switching provider without specifying model clears the previous provider's model
    const u2 = updateUserConfig({ provider: "gemini" }, env);
    assert.equal(u2.config.provider, "gemini");
    assert.equal(u2.config.model, undefined);

    const text = formatUserConfig(u2.config, u2.path);
    assert.match(text, /provider\s+gemini/);

    resetUserConfig(env);
    assert.deepEqual(loadUserConfig(env), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
