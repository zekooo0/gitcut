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

/** Map a Claude `tool_use` block into a crisp human-readable progress event. */
export function describeToolUse(name: string, input: Record<string, unknown> = {}): ProgressEvent {
  if (name === "Bash") {
    const cmd = String(input.command ?? "").trim();
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

  if (name === "Write" || name === "Edit" || name === "MultiEdit") {
    const p = shortPath(input.file_path ?? input.path);
    if (p.endsWith("NOTES.md")) return { icon: "📝", label: "Writing NOTES.md" };
    if (p.endsWith("CHANGES.md")) return { icon: "📝", label: "Writing CHANGES.md" };
    if (p.endsWith("captions.json")) return { icon: "💬", label: "Writing captions.json" };
    return { icon: "✏️ ", label: p ? `Writing ${p}` : "Editing film files" };
  }

  if (name === "Read" || name === "Glob" || name === "Grep" || name === "LS") {
    const p = shortPath(input.file_path ?? input.path ?? input.pattern);
    if (/shotcraft|SHOTS\.md|shots\.md/i.test(String(input.file_path ?? input.path ?? ""))) {
      return { icon: "🎬", label: "Studying video-shotcraft shot cards", group: "read-skill" };
    }
    if (/BRIEF\.md|EDIT\.md|facts\.md|readme\.md|pr\.md|repo\.json/i.test(p)) {
      return { icon: "📖", label: `Reading ${basename(p)}`, group: "read-brief" };
    }
    return { icon: "📖", label: p ? `Reading ${p}` : "Exploring inputs", group: "read" };
  }

  return { icon: "✨", label: name || "Working" };
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

    if (msg.type === "assistant") {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use") {
            const ev = describeToolUse(String(block.name ?? ""), (block.input ?? {}) as Record<string, unknown>);
            activeLabel = `${ev.label}…`;
            lastStepAt = Date.now();
            if (ev.group && ev.group === lastGroup) continue;
            lastGroup = ev.group;
            emitLine(ev.icon, ev.label);
          }
        }
      }
    } else if (msg.type === "result") {
      turns += Number(msg.num_turns ?? 0);
      if (typeof msg.total_cost_usd === "number") cost = msg.total_cost_usd;
    }
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
