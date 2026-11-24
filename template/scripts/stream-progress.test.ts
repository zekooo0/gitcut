import assert from "node:assert/strict";
import { test } from "node:test";
import { describeToolUse, formatElapsed } from "./stream-progress.ts";

test("formatElapsed formats milliseconds as mm:ss", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(5_400), "00:05");
  assert.equal(formatElapsed(125_000), "02:05");
});

test("describeToolUse maps ElevenLabs, Remotion, Write, and Read events cleanly", () => {
  assert.equal(
    describeToolUse("Bash", { command: 'node scripts/eleven.js tts "Hello" film/public/voice/vo1.mp3' }).label,
    "Generating voice-over (vo1.mp3)",
  );
  assert.equal(
    describeToolUse("Bash", { command: 'node scripts/eleven.ts music "upbeat synth" 25 film/public/music.mp3' }).label,
    "Composing background music",
  );
  assert.equal(
    describeToolUse("Bash", { command: 'node scripts/eleven.js sfx "whoosh" film/public/sfx/cut.mp3' }).label,
    "Generating sound effect (cut.mp3)",
  );
  assert.match(describeToolUse("Bash", { command: "cd film && npm run render" }).label, /Rendering final MP4/);
  assert.equal(describeToolUse("Bash", { command: "npx remotion still src/index.ts Film --frame=30 a.png" }).group, "stills");
  assert.equal(describeToolUse("Write", { file_path: "/tmp/x/creative/captions.json" }).label, "Writing captions.json");
  assert.equal(describeToolUse("Edit", { file_path: "/tmp/x/creative/film/src/Film.tsx" }).label, "Writing src/Film.tsx");
  assert.equal(describeToolUse("Read", { file_path: "/tmp/x/shotcraft/SKILL.md" }).group, "read-skill");
});
