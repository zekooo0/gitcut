/**
 * Live progress renderer for Claude Code's `--output-format stream-json` stream.
 *
 * Reads JSONL from stdin, writes `<epoch>\t<line>` to the log file (argv[2]) for CI/post-run
 * timing reports, and renders crisp real-time status lines (with an animated spinner & ticking
 * clock on interactive TTYs, or clean plain lines in CI).
 *
 *   claude ... --output-format stream-json --verbose 2>&1 | node scripts/stream-progress.ts <agent.log>
 */
import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

export type ProgressEvent = {
  icon: string;
  label: string;
  /** Group key for collapsing consecutive noisy events like multiple Read calls. */
  group?: string;
};

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function shortPath(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const parts = s.split("/").filter(Boolean);
  return parts.length <= 2 ? parts.join("/") : parts.slice(-2).join("/");
}

function extractMp3(cmd: string): string {
  const m = cmd.match(/([^\s"']+\.mp3)/i);
  return m ? basename(m[1]) : "";
}

/** Map a tool call (from Claude Code, Codex, Gemini CLI, OpenCode, or built-in agent) into a progress event. */
export function describeToolUse(name: string, input: Record<string, unknown> = {}): ProgressEvent {
  const norm = name.trim().toLowerCase();
  if (norm === "bash" || norm === "run_shell_command" || norm === "shell" || norm === "command_execution") {
    const cmd = String(input.command ?? input.cmd ?? "").trim();
    if (/eleven\.(ts|js)\b/.test(cmd)) {
      const hasTts = /\btts\b/.test(cmd);
      const hasMusic = /\bmusic\b/.test(cmd);
      const hasSfx = /\bsfx\b/.test(cmd);
      if (hasTts && hasMusic) return { icon: "🎙️ ", label: "Generating voice-over & background music" };
      if (hasTts) {
        const f = extractMp3(cmd);
        return { icon: "🎙️ ", label: f ? `Generating voice-over (${f})` : "Generating voice-over" };
      }
      if (hasMusic) return { icon: "🎵", label: "Composing background music" };
      if (hasSfx) {
        const f = extractMp3(cmd);
        return { icon: "🔊", label: f ? `Generating sound effect (${f})` : "Generating sound effects" };
      }
      return { icon: "🎙️ ", label: "Generating audio with ElevenLabs" };
    }
    if (/npm run render|remotion render/.test(cmd)) {
      return { icon: "🎞️ ", label: "Rendering final MP4 (this takes ~20–90 s)" };
    }
    if (/remotion still|npm run still/.test(cmd)) {
      return { icon: "📸", label: "Rendering QA stills to verify framing", group: "stills" };
    }
    if (/npm (ci|install|i )/.test(cmd)) {
      return { icon: "📦", label: "Installing film dependencies" };
    }
    if (/shotcraft|SHOTS\.md|shots\.md/.test(cmd)) {
      return { icon: "🎬", label: "Studying video-shotcraft shot cards", group: "read-skill" };
    }
    if (/(?:cat|tee)\s+>{1,2}\s*[^\n]*(STRATEGY\.md)/.test(cmd)) {
      return { icon: "🧠", label: "Crafting creative strategy (STRATEGY.md)", group: "strategy" };
    }
    if (/(?:cat|tee)\s+>{1,2}\s*[^\n]*(NOTES\.md|CHANGES\.md|captions\.json)/.test(cmd)) {
      return { icon: "📝", label: "Writing notes & subtitle timings", group: "notes" };
    }
    if (/(?:cat|tee)\s+>{1,2}\s*[^\n]*\.(tsx|ts|css|json)/.test(cmd)) {
      return { icon: "✏️ ", label: "Writing film source files", group: "write-src" };
    }
    if (/ffmpeg|ffprobe/.test(cmd)) {
      return { icon: "🔍", label: "Verifying video & audio levels with ffmpeg", group: "ffmpeg" };
    }
    if (/^(?:cd\s+[^;&\n]+[;&]\s*)*(?:ls|cat|head|tail|find|mkdir|cp)\b/.test(cmd)) {
      return { icon: "📁", label: "Inspecting & preparing workspace", group: "workspace" };
    }
    // Strip leading `cd ...;` boilerplate so the label stays readable.
    const clean = cmd.replace(/^(?:cd\s+[^;&\n]+[;&]+\s*)+/, "").replace(/\s+/g, " ").slice(0, 60);
    return { icon: "⚙️ ", label: clean ? `Running: ${clean}` : "Running command" };
  }

  if (
    norm === "write" ||
    norm === "edit" ||
    norm === "multiedit" ||
    norm === "write_file" ||
    norm === "replace" ||
    norm === "edit_file" ||
    norm === "file_change" ||
    norm === "patch"
  ) {
    const p = shortPath(input.file_path ?? input.path ?? input.target_file);
    if (p.endsWith("STRATEGY.md")) return { icon: "🧠", label: "Crafting creative strategy (STRATEGY.md)" };
    if (p.endsWith("NOTES.md")) return { icon: "📝", label: "Writing NOTES.md" };
    if (p.endsWith("CHANGES.md")) return { icon: "📝", label: "Writing CHANGES.md" };
    if (p.endsWith("captions.json")) return { icon: "💬", label: "Writing captions.json" };
    return { icon: "✏️ ", label: p ? `Writing ${p}` : "Editing film files" };
  }

  if (
    norm === "read" ||
    norm === "read_file" ||
    norm === "glob" ||
    norm === "grep" ||
    norm === "ls" ||
    norm === "list" ||
    norm === "list_directory" ||
    norm === "search_file_content"
  ) {
    const p = shortPath(input.file_path ?? input.path ?? input.pattern ?? input.dir_path);
    if (/shotcraft|SHOTS\.md|shots\.md/i.test(String(input.file_path ?? input.path ?? input.dir_path ?? ""))) {
      return { icon: "🎬", label: "Studying video-shotcraft shot cards", group: "read-skill" };
    }
    if (/BRIEF\.md|EDIT\.md|facts\.md|readme\.md|pr\.md|repo\.json|theme\.json/i.test(p)) {
      return { icon: "📖", label: `Reading ${basename(p)}`, group: "read-brief" };
    }
    return { icon: "📖", label: p ? `Reading ${p}` : "Exploring inputs", group: "read" };
  }

  return { icon: "✨", label: name || "Working" };
}

/** Extract normalized tool-call progress events and turn/cost increments from any supported agent's JSONL event. */
export function parseAgentStreamEvent(msg: Record<string, any>): {
  events: ProgressEvent[];
  turnsDelta: number;
  costUsd?: number;
} {
  const events: ProgressEvent[] = [];
  let turnsDelta = 0;
  let costUsd: number | undefined;

  // 1. Claude Code CLI & built-in agent.ts
  if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
    for (const block of msg.message.content) {
      if (block?.type === "tool_use") {
        events.push(describeToolUse(String(block.name ?? ""), (block.input ?? {}) as Record<string, unknown>));
      }
    }
  } else if (msg.type === "result") {
    turnsDelta = Number(msg.num_turns ?? msg.stats?.tool_calls ?? 0);
    if (typeof msg.total_cost_usd === "number") costUsd = msg.total_cost_usd;
  }
  // 2. Google Gemini CLI (`--output-format stream-json`)
  else if (msg.type === "tool_use" && typeof msg.tool_name === "string") {
    events.push(describeToolUse(msg.tool_name, (msg.parameters ?? msg.args ?? {}) as Record<string, unknown>));
  }
  // 3. OpenCode CLI (`opencode run --format json`)
  else if (msg.type === "tool_use" && msg.part && typeof msg.part.tool === "string") {
    const input = (msg.part.state?.input ?? msg.part.input ?? {}) as Record<string, unknown>;
    events.push(describeToolUse(msg.part.tool, input));
  } else if (msg.type === "step_finish") {
    turnsDelta = 1;
    if (typeof msg.part?.cost === "number") costUsd = msg.part.cost;
  }
  // 4. OpenAI Codex CLI (`codex exec --json`)
  else if ((msg.type === "item.started" || msg.type === "item.completed") && msg.item) {
    const item = msg.item as Record<string, any>;
    if (item.type === "command_execution" && msg.type === "item.started") {
      events.push(describeToolUse("Bash", { command: item.command ?? "" }));
    } else if (item.type === "file_change" && msg.type === "item.completed") {
      const firstPath = Array.isArray(item.changes) ? item.changes[0]?.path : item.path;
      events.push(describeToolUse("Write", { file_path: firstPath ?? "" }));
    }
  } else if (msg.type === "turn.completed") {
    turnsDelta = 1;
  }

  return { events, turnsDelta, costUsd };
}

async function run() {
  const logPath = process.argv[2];
  if (!logPath) {
    console.error("usage: node scripts/stream-progress.ts <agent.log>");
    process.exit(2);
  }

  const logStream = createWriteStream(logPath, { flags: "w" });
  const isTTY = Boolean(process.stderr.isTTY && !process.env.CI);
  const dim = (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s);
  const cyan = (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s);
  const green = (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s);

  const startMs = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIdx = 0;
  let activeLabel = "Planning direction & storyboard…";
  let lastGroup: string | undefined;
  let lastStepAt = startMs;
  let printedSpinner = false;

  const clearSpinner = () => {
    if (isTTY && printedSpinner) {
      process.stderr.write("\r\x1b[2K");
      printedSpinner = false;
    }
  };

  const emitLine = (icon: string, text: string) => {
    clearSpinner();
    const ts = formatElapsed(Date.now() - startMs);
    process.stderr.write(`    ${dim(`[${ts}]`)} ${icon} ${text}\n`);
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  if (isTTY) {
    timer = setInterval(() => {
      const ts = formatElapsed(Date.now() - startMs);
      const spin = cyan(frames[frameIdx++ % frames.length]);
      const cols = Math.max(40, (process.stderr.columns ?? 80) - 16);
      const shown = activeLabel.length > cols ? `${activeLabel.slice(0, cols - 1)}…` : activeLabel;
      process.stderr.write(`\r\x1b[2K    ${spin} ${dim(`[${ts}]`)} ${shown}`);
      printedSpinner = true;
    }, 120);
  } else {
    // Non-TTY (CI): print a gentle heartbeat every 30s if a single step runs long.
    timer = setInterval(() => {
      if (Date.now() - lastStepAt >= 30_000) {
        emitLine("⏳", `Still working: ${activeLabel}`);
        lastStepAt = Date.now();
      }
    }, 10_000);
  }

  let turns = 0;
  let cost = 0;

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    logStream.write(`${(Date.now() / 1000).toFixed(1)}\t${line}\n`);
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    const parsed = parseAgentStreamEvent(msg);
    for (const ev of parsed.events) {
      activeLabel = `${ev.label}…`;
      lastStepAt = Date.now();
      if (ev.group && ev.group === lastGroup) continue;
      lastGroup = ev.group;
      emitLine(ev.icon, ev.label);
    }
    if (parsed.turnsDelta > 0) turns += parsed.turnsDelta;
    if (typeof parsed.costUsd === "number") cost += parsed.costUsd;
  }

  if (timer) clearInterval(timer);
  clearSpinner();
  await new Promise<void>((res) => logStream.end(res));

  const wallMin = ((Date.now() - startMs) / 60_000).toFixed(1);
  const costPart = cost > 0 ? ` · ~$${cost.toFixed(2)} API-eq` : "";
  process.stderr.write(`  ${green("✓")} Director done  ${dim(`${turns} turns · ${wallMin} min${costPart}`)}\n`);
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  await run();
}
