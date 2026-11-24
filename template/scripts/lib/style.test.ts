import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeStyle, renderStyleBriefSection, resolveStyle } from "./style.ts";

test("normalizeStyle accepts all valid presets and rejects unknown values", () => {
  assert.equal(normalizeStyle(undefined), "auto");
  assert.equal(normalizeStyle("editorial_light"), "editorial-light");
  assert.equal(normalizeStyle("KINETIC-BOLD"), "kinetic-bold");
  assert.equal(normalizeStyle("rainbow-disco"), null);
});

test("resolveStyle auto picks brand-native when live theme exists, and varies across presets for repos", () => {
  const lightSite = resolveStyle("auto", {
    theme: { mode: "light", background: "#FFFDF7", text: "#111111", accent: "#E11D48", headingFont: "Fraunces" },
  });
  assert.equal(lightSite.name, "brand-native");
  assert.equal(lightSite.palette.background, "#FFFDF7");
  assert.equal(lightSite.palette.accent, "#E11D48");

  const styles = new Set(["repo-a", "repo-b", "repo-c", "repo-d", "repo-e", "repo-f", "repo-g"].map((s) => resolveStyle("auto", { seed: s }).name));
  assert.ok(styles.size >= 2, "auto repo style should vary across presets");
  assert.ok(!styles.has("dark-glow"), "auto repo mode should not default to dark-glow");
});

test("renderStyleBriefSection embeds palette, forbidden rules, and recommended shot cards", () => {
  const spec = resolveStyle("editorial-light");
  const md = renderStyleBriefSection(spec);
  assert.match(md, /#F6F3EC/);
  assert.match(md, /NO dark or navy backgrounds/);
  assert.match(md, /paper-title-card\.md/);
});
