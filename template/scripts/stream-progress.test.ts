import assert from "node:assert/strict";
import { test } from "node:test";
import { describeToolUse, formatElapsed, parseAgentStreamEvent } from "./stream-progress.ts";

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
  assert.equal(
    describeToolUse("Bash", { command: 'cd /tmp/x; e(){ node dist/eleven.js "$@"; }; e tts "hi" a.mp3; e music "chill" 25 m.mp3' }).label,
    "Generating voice-over & background music",
  );
  assert.equal(
    describeToolUse("Bash", { command: "cd /tmp/x; ls; cat BRIEF.md" }).group,
    "workspace",
  );
  assert.equal(
    describeToolUse("Bash", { command: "cd /tmp/x; cat > STRATEGY.md <<EOF\n# Strategy\nEOF" }).label,
    "Crafting creative strategy (STRATEGY.md)",
  );
  assert.equal(
    describeToolUse("Bash", { command: "cd /tmp/x; cat > NOTES.md <<EOF\nhi\nEOF" }).label,
    "Writing notes & subtitle timings",
  );
  assert.equal(
    describeToolUse("Write", { file_path: "/tmp/x/creative/STRATEGY.md" }).label,
    "Crafting creative strategy (STRATEGY.md)",
  );
  assert.equal(describeToolUse("Write", { file_path: "/tmp/x/creative/captions.json" }).label, "Writing captions.json");
  assert.equal(describeToolUse("Edit", { file_path: "/tmp/x/creative/film/src/Film.tsx" }).label, "Writing src/Film.tsx");
  assert.equal(describeToolUse("Read", { file_path: "/tmp/x/shotcraft/SKILL.md" }).group, "read-skill");
});

test("parseAgentStreamEvent normalizes Codex, Gemini CLI, OpenCode, and Claude/agent streams", () => {
  // Codex CLI
  const codex = parseAgentStreamEvent({
    type: "item.started",
    item: { type: "command_execution", command: "cd film && npm run render" },
  });
  assert.match(codex.events[0]?.label ?? "", /Rendering final MP4/);

  // Gemini CLI
  const gemini = parseAgentStreamEvent({
    type: "tool_use",
    tool_name: "write_file",
    parameters: { file_path: "/tmp/x/creative/STRATEGY.md" },
  });
  assert.equal(gemini.events[0]?.label, "Crafting creative strategy (STRATEGY.md)");

  // OpenCode CLI
  const opencode = parseAgentStreamEvent({
    type: "tool_use",
    part: { tool: "read", state: { input: { file_path: "/tmp/x/creative/input/theme.json" } } },
  });
  assert.equal(opencode.events[0]?.label, "Reading theme.json");

  const stepFinish = parseAgentStreamEvent({ type: "step_finish", part: { cost: 0.05 } });
  assert.equal(stepFinish.turnsDelta, 1);
  assert.equal(stepFinish.costUsd, 0.05);
});
