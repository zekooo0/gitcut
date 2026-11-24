import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSrt, formatVtt, normalizeCues } from "./subtitles.ts";

test("normalizeCues sorts cues and drops invalid entries", () => {
  const cues = normalizeCues([
    { start: 3.5, end: 6.0, text: "Second line" },
    { start: 0.5, end: 3.125, text: "First line" },
    { start: 5, end: 4, text: "Invalid reversed" },
    { start: 7, end: 8, text: "   " },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "First line");
  assert.equal(cues[1].text, "Second line");
});

test("formatSrt and formatVtt emit valid timestamped captions", () => {
  const cues = normalizeCues([
    { start: 0.5, end: 3.125, text: "Hello world" },
    { start: 65.2, end: 70.0, text: "Next beat" },
  ]);
  assert.equal(
    formatSrt(cues),
    "1\n00:00:00,500 --> 00:00:03,125\nHello world\n\n2\n00:01:05,200 --> 00:01:10,000\nNext beat\n",
  );
  assert.equal(
    formatVtt(cues),
    "WEBVTT\n\n00:00:00.500 --> 00:00:03.125\nHello world\n\n00:01:05.200 --> 00:01:10.000\nNext beat\n",
  );
});
