import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDescription, buildTitle, parsePrivacy } from "./youtube.ts";

test("buildTitle strips a conventional-commit prefix and optionally adds the product name", () => {
  assert.equal(buildTitle("feat(orders): Process returns from the order", "Acme App"), "Acme App: Process returns from the order");
  assert.equal(buildTitle("Fix: guest quotes toggle", "Acme App"), "Acme App: guest quotes toggle");
  assert.equal(buildTitle("feat(ui): Dark mode toggle"), "Dark mode toggle");
});

test("buildTitle never exceeds 100 characters and drops angle brackets", () => {
  const t = buildTitle(`feat: ${"very long title ".repeat(20)}<script>`, "Acme App");
  assert.ok(t.length <= 100);
  assert.ok(!/[<>]/.test(t));
});

test("buildTitle has a fallback for an empty title", () => {
  assert.equal(buildTitle("feat:", "Acme App"), "Acme App: new feature");
  assert.equal(buildTitle("feat:"), "new feature");
});

test("buildDescription uses configured product metadata and strips angle brackets", () => {
  const d = buildDescription({
    productName: "Acme App",
    description: "Acme App helps teams ship faster.",
    website: "https://example.com",
  });
  assert.ok(d.includes("Acme App helps teams ship faster."));
  assert.ok(d.includes("https://example.com"));
  assert.ok(!/github\.com|clickup/i.test(d));
});

test("buildDescription has a sensible fallback with no product metadata", () => {
  assert.equal(buildDescription(), "Product feature walkthrough.");
  assert.equal(buildDescription({ productName: "Acme App" }), "A new feature in Acme App.");
});

test("parsePrivacy defaults to private for anything unknown", () => {
  assert.equal(parsePrivacy(undefined), "private");
  assert.equal(parsePrivacy("PUBLIC"), "public");
  assert.equal(parsePrivacy("unlisted"), "unlisted");
  assert.equal(parsePrivacy("everyone"), "private");
});
