import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFormat, resolveFormat } from "./format.ts";

test("normalizeFormat maps names and aspect-ratio aliases", () => {
  assert.equal(normalizeFormat(undefined), "landscape");
  assert.equal(normalizeFormat("16:9"), "landscape");
  assert.equal(normalizeFormat("square"), "square");
  assert.equal(normalizeFormat("1:1"), "square");
  assert.equal(normalizeFormat("9:16"), "vertical");
  assert.equal(normalizeFormat("Shorts"), "vertical");
  assert.equal(normalizeFormat("4:3"), null);
});

test("resolveFormat returns exact dimensions and rejects unknown values", () => {
  const sq = resolveFormat("1:1");
  assert.equal(sq.width, 1080);
  assert.equal(sq.height, 1080);
  const v = resolveFormat("vertical");
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);
  assert.throws(() => resolveFormat("cinemascope"), /Unknown format/);
});
