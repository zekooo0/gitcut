import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildInitialConfig } from "./cli.ts";
import { slugifyTitle } from "./brief.ts";

const CLI = new URL("./cli.ts", import.meta.url).pathname;

test("buildInitialConfig creates valid site config with optional login", () => {
  const pub = buildInitialConfig({ url: "http://localhost:3000", name: "Demo", accent: "#10B981" });
  assert.equal(pub.baseUrl, "http://localhost:3000");
  assert.equal(pub.login, undefined);
  assert.deepEqual(pub.brand, { accent: "#10B981" });

  const authed = buildInitialConfig({ withLogin: true });
  assert.ok(authed.login);
});

test("slugifyTitle turns free-form titles into safe slugs", () => {
  assert.equal(slugifyTitle("Dark Mode & Theme Toggle!"), "dark-mode-theme-toggle");
  assert.equal(slugifyTitle("   "), "gitcut-video");
});

test("cli init scaffolds .gitcut.json and refuses overwrite without --force", () => {
  const dir = mkdtempSync(join(tmpdir(), "gc-cli-"));
  try {
    const out = join(dir, ".gitcut.json");
    execFileSync("node", [CLI, "init", "--url", "http://localhost:4000", "--name", "Local App", "--out", out], {
      encoding: "utf8",
    });
    assert.ok(existsSync(out));
    const parsed = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(parsed.baseUrl, "http://localhost:4000");
    assert.equal(parsed.product.name, "Local App");

    assert.throws(() => execFileSync("node", [CLI, "init", "--out", out], { stdio: "pipe" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli help prints usage and exits 0", () => {
  const out = execFileSync("node", [CLI, "help"], { encoding: "utf8" });
  assert.match(out, /gitcut create/);
  assert.match(out, /gitcut repo/);
  assert.match(out, /gitcut init/);
});

test("cli repo --plan-only builds repo.json, BRIEF.md, and copies README assets", () => {
  const srcDir = mkdtempSync(join(tmpdir(), "gc-repo-src-"));
  const outDir = mkdtempSync(join(tmpdir(), "gc-repo-out-"));
  try {
    execFileSync("node", ["-e", `
      const fs = require("node:fs");
      const path = require("node:path");
      fs.mkdirSync(path.join(process.argv[1], "docs"), { recursive: true });
      fs.writeFileSync(path.join(process.argv[1], "docs/shot.png"), "PNG");
      fs.writeFileSync(path.join(process.argv[1], "package.json"), JSON.stringify({ name: "demo-cli", description: "Fast CLI tool", license: "MIT" }));
      fs.writeFileSync(path.join(process.argv[1], "README.md"), "# Demo CLI\\n![Shot](./docs/shot.png)\\nInstall: \`npm i demo-cli\`");
    `, srcDir]);
    execFileSync("node", [CLI, "repo", srcDir, "--out", outDir, "--plan-only"], { encoding: "utf8" });
    const meta = JSON.parse(readFileSync(join(outDir, "repo.json"), "utf8"));
    assert.equal(meta.mode, "repo");
    assert.equal(meta.name, "demo-cli");
    assert.equal(meta.license, "MIT");
    assert.ok(existsSync(join(outDir, "BRIEF.md")));
    assert.ok(existsSync(join(outDir, "assets/shot.png")));
  } finally {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});
