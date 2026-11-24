import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSelectFrame, renderBanner, renderSummaryBox } from "./prompts.ts";

test("renderBanner includes GitCut title and version", () => {
  const b = renderBanner("0.1.3");
  assert.match(b, /GitCut/);
  assert.match(b, /v0\.1\.3/);
  assert.match(b, /┌/);
  assert.match(b, /└/);
});

test("formatSelectFrame marks only the active option with a filled bullet", () => {
  const lines = formatSelectFrame(
    "Pick a format",
    [
      { value: "vertical", label: "Vertical (9:16)", hint: "Shorts / Reels" },
      { value: "landscape", label: "Landscape (16:9)", hint: "YouTube / Docs" },
    ],
    1,
  );
  assert.match(lines[0], /Pick a format/);
  assert.match(lines[1], /○/);
  assert.match(lines[2], /●/);
  assert.match(lines[2], /Landscape \(16:9\)/);
});

test("renderSummaryBox formats key-value rows cleanly", () => {
  const s = renderSummaryBox([
    ["Target", "zekooo0/gitcut"],
    ["Format", "vertical (1080x1920)"],
  ]);
  assert.match(s, /Summary/);
  assert.match(s, /Target\s+zekooo0\/gitcut/);
  assert.match(s, /Format\s+vertical \(1080x1920\)/);
});
