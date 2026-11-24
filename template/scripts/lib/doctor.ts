/**
 * Preflight environment checks (`gitcut doctor`) and GitHub remote detection (`gitcut setup-github`).
 * Zero external dependencies.
 */
import { spawnSync } from "node:child_process";

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

  // 2. Claude Code CLI
  const hasClaude = cmdExists("claude");
  if (!hasClaude) {
    results.push({
      name: "Claude Code CLI",
      required: true,
      ok: false,
      detail: "not installed",
      fix: "Run `npm install -g @anthropic-ai/claude-code`, then run `claude` once to sign in.",
    });
  } else if (opts.skipAuth) {
    results.push({ name: "Claude Code CLI", required: true, ok: true, detail: "installed (auth check skipped)" });
  } else {
    const auth = spawnSync("claude", ["-p", "Reply ok", "--model", "haiku"], {
      encoding: "utf8",
      timeout: 20_000,
    });
    const ok = auth.status === 0;
    results.push({
      name: "Claude Code CLI",
      required: true,
      ok,
      detail: ok ? "installed & signed in" : "installed, but not signed in",
      fix: ok ? undefined : "Run `claude` in your terminal to sign in, or set CLAUDE_CODE_OAUTH_TOKEN.",
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
