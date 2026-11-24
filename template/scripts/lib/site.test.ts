import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadSite, loadSiteForDir } from "./site.ts";

test("loadSite loads a named site from template/sites/", () => {
  const s = loadSite({ site: "example" });
  assert.equal(s.baseUrl, "https://staging.example.com");
  assert.equal(s.product?.name, "Acme App");
});

test("loadSite loads a direct .json path and overlays inline overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "fv-site-"));
  try {
    const file = join(dir, "custom.json");
    writeFileSync(file, JSON.stringify({ baseUrl: "https://one.example.com", panel: "main" }));
    const s = loadSite({ site: file, baseUrl: "https://two.example.com" });
    assert.equal(s.baseUrl, "https://two.example.com");
    assert.equal(s.panel, "main");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSite and loadSiteForDir fall back to <dir>/site.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "fv-dir-"));
  try {
    writeFileSync(
      join(dir, "site.json"),
      JSON.stringify({
        baseUrl: "https://preview.example.com",
        brand: { accent: "#10B981" },
        product: { name: "Preview App" },
      }),
    );
    writeFileSync(join(dir, "capture.json"), JSON.stringify({ shots: [] }));
    const s = loadSiteForDir(dir);
    assert.ok(s);
    assert.equal(s.baseUrl, "https://preview.example.com");
    assert.equal(s.brand?.accent, "#10B981");
    assert.equal(s.product?.name, "Preview App");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSite throws when no baseUrl is provided", () => {
  assert.throws(() => loadSite({}), /no baseUrl/);
});
