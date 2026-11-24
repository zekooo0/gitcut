/**
 * Preflight environment checks (`gitcut doctor`) and GitHub remote detection (`gitcut setup-github`).
 * Zero external dependencies.
 */
import { spawnSync } from "node:child_process";
import { loadUserConfig } from "./config.ts";
import { detectProviders } from "./providers.ts";

export type CheckResult = {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
  fix?: string;
};

export function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const s = remoteUrl.trim();
  const https = s.match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (https) return { owner: https[1], repo: https[2] };
  const ssh = s.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  return null;
}

export function detectGitHubRepo(cwd: string): { owner: string; repo: string } | null {
  const res = spawnSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8" });
  if (res.status !== 0 || !res.stdout) return null;
  return parseGitHubRemote(res.stdout);
}

function cmdExists(bin: string): boolean {
  const res = spawnSync("which", [bin], { encoding: "utf8" });
  return res.status === 0 && Boolean(res.stdout.trim());
}

export function runDoctorChecks(opts: { skipAuth?: boolean; env?: NodeJS.ProcessEnv } = {}): CheckResult[] {
  const env = opts.env ?? process.env;
  const results: CheckResult[] = [];

  // 1. Node.js >= 24
  const major = Number(process.versions.node.split(".")[0]);
  results.push({
    name: "Node.js (>= 24)",
    required: true,
    ok: major >= 24,
    detail: `v${process.versions.node}`,
    fix: major >= 24 ? undefined : "Install Node.js 24+ from https://nodejs.org (or `nvm install 24`).",
  });

  // 2. AI Providers (any supported coding CLI or direct API key works!)
  const providers = detectProviders({ env });
  const ready = providers.filter((p) => p.available);
  if (ready.length === 0) {
    results.push({
      name: "AI Provider",
      required: true,
      ok: false,
      detail: "none detected",
      fix: "Install a CLI (`claude`, `codex`, `gemini`, or `opencode`) OR set an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, or OLLAMA_HOST).",
    });
  } else {
    const summary = ready.map((p) => p.info.id).join(", ");
    const cfg = loadUserConfig(env);
    const active = cfg.provider ? ` · global default: ${cfg.provider}${cfg.model ? ` (${cfg.model})` : ""}` : "";
    results.push({
      name: "AI Provider",
      required: true,
      ok: true,
      detail: `${ready.length} available (${summary})${active}`,
    });
  }

  // 3. jq (used by creative.sh)
  const hasJq = cmdExists("jq");
  results.push({
    name: "jq",
    required: true,
    ok: hasJq,
    detail: hasJq ? "installed" : "not installed",
    fix: hasJq ? undefined : "Install jq: `brew install jq` (macOS) or `sudo apt install jq` (Ubuntu/Debian).",
  });

  // 4. ffmpeg (optional: contact sheet + ElevenLabs SFX levelling)
  const hasFfmpeg = cmdExists("ffmpeg");
  results.push({
    name: "FFmpeg",
    required: false,
    ok: hasFfmpeg,
    detail: hasFfmpeg ? "installed (contact sheets & SFX levelling enabled)" : "not installed (contact sheets skipped)",
    fix: hasFfmpeg ? undefined : "Optional: `brew install ffmpeg` (macOS) or `sudo apt install ffmpeg` (Ubuntu/Debian).",
  });

  // 5. GitHub CLI (optional: private repos & PR mode)
  const hasGh = cmdExists("gh");
  const ghAuthed = hasGh && spawnSync("gh", ["auth", "status"], { encoding: "utf8" }).status === 0;
  results.push({
    name: "GitHub CLI (gh)",
    required: false,
    ok: ghAuthed,
    detail: ghAuthed
      ? "signed in (PR mode & private repos ready)"
      : hasGh
        ? "installed, not signed in (public repos still work)"
        : "not installed (public repos & local mode still work)",
    fix: ghAuthed ? undefined : "Optional for PR mode / private repos: install `gh` and run `gh auth login`.",
  });

  // 6. Audio mode (ElevenLabs optional)
  const hasEleven = Boolean(env.ELEVENLABS_API_KEY?.trim());
  results.push({
    name: "Audio (ElevenLabs)",
    required: false,
    ok: true,
    detail: hasEleven
      ? "ELEVENLABS_API_KEY set (voice-over, music & SFX enabled)"
      : "not set — silent/captioned mode enabled by default (free)",
  });

  return results;
}

export function formatDoctorReport(results: CheckResult[]): { text: string; passed: boolean } {
  const lines = ["GitCut environment check", ""];
  let passed = true;
  for (const r of results) {
    const icon = r.ok ? "✓" : r.required ? "✗" : "○";
    if (!r.ok && r.required) passed = false;
    lines.push(`  ${icon} ${r.name.padEnd(20)} ${r.detail}`);
    if (!r.ok && r.fix) lines.push(`      → ${r.fix}`);
  }
  lines.push("");
  lines.push(
    passed
      ? "Ready! Run `gitcut` for the interactive wizard, or `gitcut repo owner/repo` to make your first reel."
      : "Fix the items marked with ✗ above, then re-run `gitcut doctor`.",
  );
  return { text: lines.join("\n"), passed };
}
