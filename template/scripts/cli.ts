#!/usr/bin/env node
/**
 * Unified local CLI for GitCut.
 *
 *   gitcut                   Interactive wizard (when run in a terminal with no args)
 *   gitcut doctor            Check local prerequisites (Node, Claude Code, jq, ffmpeg, gh)
 *   gitcut setup-github      Generate .gitcut.json + .github/workflows/gitcut.yml for your repo
 *   gitcut init              Scaffold .gitcut.json only
 *   gitcut repo              <owner/repo | github-url | local-dir> [--format vertical|square|landscape] [--captions] [--accent <#hex>] [--ref <branch>] [--plan-only] [--out <dir>] [--audio auto|elevenlabs|silent]
 *   gitcut create            (--pr owner/repo#123 | --url <url> --brief <text> [--brief-file <md>])
 *                            [--title <title>] [--routes /a,/b] [--site <name|path>] [--format <preset>] [--captions] [--out <dir>] [--audio auto|elevenlabs|silent]
 *   gitcut plan              ...same planning options as create...
 *   gitcut capture           <dir>
 *   gitcut film              <dir> [--pr owner/repo#123] [--format <preset>] [--captions] [--audio auto|elevenlabs|silent]
 *   gitcut edit              <dir> <request...> [--pr owner/repo#123] [--audio auto|elevenlabs|silent]
 *   gitcut render            <dir> [--out <video.mp4>]
 *   gitcut subtitles         <dir>
 *   gitcut notify            --video <url> [--title <t>] [--youtube <url>] [--captions <url>] [--pr owner/repo#123] [--linear ENG-123]
 *   gitcut discover          <site-or-url> <path> [--json]
 *   gitcut help
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { slugifyTitle } from "./brief.ts";
import { detectGitHubRepo, formatDoctorReport, runDoctorChecks } from "./lib/doctor.ts";
import { confirmPrompt, renderBanner, renderSummaryBox, selectPrompt, textPrompt } from "./lib/prompts.ts";
import { slugFor } from "./slug.ts";

const TEMPLATE_DIR = new URL("..", import.meta.url).pathname;
const REPO_ROOT = resolve(TEMPLATE_DIR, "..");
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT_EXT = import.meta.url.endsWith(".js") ? "js" : "ts";
const scriptPath = (name: string) => join(SCRIPTS_DIR, `${name}.${SCRIPT_EXT}`);

export const CLI_HELP = `GitCut CLI

Usage:
  gitcut                   Interactive guided wizard (easiest way to start!)
  gitcut doctor            Check local prerequisites (Node 24+, Claude Code, jq, ffmpeg, gh)
  gitcut setup-github      Add .gitcut.json + .github/workflows/gitcut.yml to your repo
  gitcut init              [--url <url>] [--auto-preview] [--name <product>] [--website <url>] [--accent <#hex>] [--out .gitcut.json] [--force]
  gitcut repo              <owner/repo | github-url | local-dir> [--format vertical|square|landscape|9:16|1:1|16:9] [--captions] [--accent <#hex>] [--ref <branch>] [--plan-only] [--out <dir>] [--audio auto|elevenlabs|silent]
  gitcut create            [--pr owner/repo#123 | --brief <text> | --brief-file <md>] [--url <url>] [--auto-preview] [--title <title>] [--routes /a,/b] [--site <name|path>] [--format landscape|square|vertical|16:9|1:1|9:16] [--captions] [--out <dir>] [--audio auto|elevenlabs|silent]
  gitcut plan              ...same planning options as create (stops after capture.json + BRIEF.md)...
  gitcut capture           <dir>
  gitcut film              <dir> [--pr owner/repo#123] [--format <preset>] [--captions] [--audio auto|elevenlabs|silent]
  gitcut edit              <dir> <request...> [--pr owner/repo#123] [--audio auto|elevenlabs|silent]
  gitcut render            <dir> [--out <file.mp4>]
  gitcut subtitles         <dir>
  gitcut notify            --video <url> [--title <t>] [--youtube <url>] [--captions <url>] [--pr owner/repo#123] [--linear ENG-123]
  gitcut discover          <site-or-url> <path> [--json]
  gitcut help

Examples:
  # 0. First time? Check your setup or launch the interactive wizard
  gitcut doctor
  gitcut

  # 1. Set up GitHub Actions in your app repo (writes .gitcut.json + .github/workflows/gitcut.yml)
  gitcut setup-github --auto-preview --name "My App"

  # 2. Generate a 15-30s repository showcase reel from ANY GitHub repo (no browser needed!)
  gitcut repo zekooo0/gitcut --format vertical --captions

  # 3. Generate a live-UI feature video from a local server or staging URL
  gitcut create \\
    --url http://localhost:3000 \\
    --title "Dark mode toggle" \\
    --brief "Users can now switch between light and dark themes in Settings." \\
    --routes /settings

  # 4. Edit the film in plain English and render the final MP4
  gitcut edit public/features/dark-mode-toggle "shorter intro, brighter highlight"
  gitcut render public/features/dark-mode-toggle --out ./dark-mode.mp4

Audio:
  Set ELEVENLABS_API_KEY to automatically start the isolated local ElevenLabs proxy (voice-over,
  music, SFX). Omit ELEVENLABS_API_KEY or pass --audio silent for silent/captioned mode.`;

export function buildInitialConfig(opts: {
  url?: string;
  autoPreview?: boolean;
  name?: string;
  website?: string;
  accent?: string;
  withLogin?: boolean;
}) {
  const name = opts.name || "My App";
  const cfg: Record<string, unknown> = {
    ...(opts.autoPreview ? { autoPreview: true } : {}),
    ...(opts.url || !opts.autoPreview ? { baseUrl: opts.url || "https://staging.example.com" } : {}),
    viewport: { width: 1440, height: 900, dpr: 2 },
    panel: "auto",
    hide: ["#hubspot-messages-iframe-container", "iframe[title*=chat i]"],
    brand: {
      accent: opts.accent || "#2563EB",
    },
    product: {
      name,
      description: `A short product walkthrough for ${name}.`,
      audience: "users",
      ...(opts.website ? { website: opts.website } : {}),
    },
    safetyRules: [
      "Never submit destructive changes on shared staging data: avoid clicking Save, Delete, or Send.",
    ],
  };
  if (opts.withLogin) {
    cfg.login = {
      url: "/login",
      fields: {
        "input[name=email]": "DEMO_EMAIL",
        "input[name=password]": "DEMO_PASSWORD",
      },
      submit: "button[type=submit]",
      loggedOut: "/login",
    };
  }
  return cfg;
}

export function runSetupGitHub(opts: {
  dir?: string;
  url?: string;
  autoPreview?: boolean;
  name?: string;
  website?: string;
  accent?: string;
  withLogin?: boolean;
  pipelineRepo?: string;
  force?: boolean;
}): { configPath: string; workflowPath: string; secretsUrl: string | null } {
  const targetDir = resolve(opts.dir ?? process.cwd());
  const configPath = join(targetDir, ".gitcut.json");
  const workflowDir = join(targetDir, ".github", "workflows");
  const workflowPath = join(workflowDir, "gitcut.yml");

  if (!opts.force) {
    if (existsSync(configPath)) throw new Error(`${configPath} already exists. Pass --force to overwrite.`);
    if (existsSync(workflowPath)) throw new Error(`${workflowPath} already exists. Pass --force to overwrite.`);
  }

  const cfg = buildInitialConfig({
    url: opts.url,
    autoPreview: opts.autoPreview,
    name: opts.name,
    website: opts.website,
    accent: opts.accent,
    withLogin: opts.withLogin,
  });
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");

  const examplePath = join(REPO_ROOT, "examples", "gitcut.yml");
  let workflow = readFileSync(examplePath, "utf8");
  if (opts.pipelineRepo && opts.pipelineRepo !== "zekooo0/gitcut") {
    workflow = workflow.replaceAll("zekooo0/gitcut", opts.pipelineRepo);
  }
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(workflowPath, workflow);

  const ghRepo = detectGitHubRepo(targetDir);
  const secretsUrl = ghRepo
    ? `https://github.com/${ghRepo.owner}/${ghRepo.repo}/settings/secrets/actions`
    : null;
  return { configPath, workflowPath, secretsUrl };
}

function runSync(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? TEMPLATE_DIR,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

async function startElevenProxyIfNeeded(audio: string): Promise<{ mode: string; stop: () => void }> {
  const endpoint = process.env.ELEVEN_URL || "http://127.0.0.1:8790";
  const noop = () => {};

  if (audio === "silent") return { mode: "silent", stop: noop };

  // Reuse an already-running proxy if present.
  try {
    const r = await fetch(`${endpoint}/usage`);
    if (r.ok) return { mode: "elevenlabs", stop: noop };
  } catch { /* not running */ }

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    if (audio === "elevenlabs") {
      console.error("ELEVENLABS_API_KEY is not set and no ElevenLabs proxy is running.");
      process.exit(1);
    }
    console.log("ELEVENLABS_API_KEY not set: running in silent/captioned mode.");
    return { mode: "silent", stop: noop };
  }

  const env = { ...process.env };
  delete env.ELEVENLABS_API_KEY;
  const child: ChildProcess = spawn("node", [scriptPath("eleven"), "serve"], {
    cwd: TEMPLATE_DIR,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin?.end(key);
  const stop = () => {
    if (!child.killed) child.kill("SIGTERM");
  };

  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${endpoint}/usage`);
      if (r.ok) return { mode: "elevenlabs", stop };
    } catch { /* waiting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  console.error("Failed to start local ElevenLabs proxy.");
  process.exit(1);
}

function defaultOutputDir(slug: string): string {
  return join(process.cwd(), ".gitcut", slug);
}

function resolveFeatureDir(args: {
  out?: string;
  slug?: string;
  pr?: string;
  url?: string;
  title?: string;
  brief?: string;
}): string {
  if (args.out) return resolve(args.out);
  if (args.slug) return defaultOutputDir(args.slug);
  if (args.pr) {
    const safe = args.pr.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
    return defaultOutputDir(safe);
  }
  const urlHost = (() => {
    try {
      return args.url ? new URL(args.url).hostname : "";
    } catch {
      return "";
    }
  })();
  const title = args.title?.trim() || args.brief?.trim().split("\n")[0] || urlHost || "gitcut-video";
  return defaultOutputDir(slugifyTitle(title));
}

async function runCreative(
  dir: string,
  opts: { pr?: string; audio: string; format?: string; captions?: boolean; editRequest?: string },
) {
  const absDir = resolve(dir);
  const runTemp = process.env.RUNNER_TEMP || mkdtempSync(join(tmpdir(), "gitcut-run-"));
  const ownTemp = !process.env.RUNNER_TEMP;
  const { mode, stop } = await startElevenProxyIfNeeded(opts.audio);
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AUDIO_MODE: mode,
      RUNNER_TEMP: runTemp,
    };
    delete env.ELEVENLABS_API_KEY;
    if (opts.format) env.VIDEO_FORMAT = opts.format;
    if (opts.captions !== undefined) env.CAPTIONS_MODE = opts.captions ? "on" : "off";
    if (opts.editRequest) env.EDIT_REQUEST = opts.editRequest;
    const args = [join(TEMPLATE_DIR, "scripts/creative.sh"), absDir];
    if (opts.pr) args.push(opts.pr);
    runSync("bash", args, { cwd: TEMPLATE_DIR, env });
  } finally {
    stop();
    if (ownTemp) rmSync(runTemp, { recursive: true, force: true });
  }
}

function readCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function listExistingFilms(cwd: string): string[] {
  const base = join(cwd, ".gitcut");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((dir) => existsSync(join(dir, "creative", "film", "package.json")));
}

async function runWizard() {
  console.log(renderBanner(readCliVersion()));
  const existingFilms = listExistingFilms(process.cwd());

  const menuOptions = [
    { value: "repo", label: "Repo / README Reel", hint: "15–30 s showcase from any GitHub repo (no browser)" },
    { value: "live", label: "Live App Feature Video", hint: "Playwright captures your real UI from a URL" },
    ...(existingFilms.length
      ? [{ value: "edit", label: "Edit an existing video", hint: `Modify one of ${existingFilms.length} film(s) in ./.gitcut/` }]
      : []),
    { value: "setup-github", label: "Set up GitHub Actions", hint: "Add .gitcut.json + /gitcut PR workflow to this repo" },
    { value: "doctor", label: "Check my setup (doctor)", hint: "Verify Node, Claude Code, jq, ffmpeg, and audio" },
  ];

  let choice: string;
  try {
    choice = await selectPrompt("What would you like to do?", menuOptions);
  } catch {
    return;
  }

  try {
    if (choice === "doctor") {
      const report = formatDoctorReport(runDoctorChecks());
      console.log("\n" + report.text);
      if (!report.passed) process.exit(1);
      return;
    }

    if (choice === "setup-github") {
      const ghRepo = detectGitHubRepo(process.cwd());
      const name = await textPrompt("Product name", { defaultValue: ghRepo?.repo ?? "My App" });
      const autoPreview = await confirmPrompt("Use automatic Vercel / Netlify / Cloudflare PR preview URLs?", true);
      const url = autoPreview
        ? undefined
        : await textPrompt("Staging app URL", {
            defaultValue: "https://staging.example.com",
            validate: (v) => (/^https?:\/\//i.test(v) ? null : "Enter a valid http:// or https:// URL."),
          });
      const withLogin = await confirmPrompt("Does your app require email/password login?", false);
      const res = runSetupGitHub({ name, autoPreview, url, withLogin });
      printSetupGitHubNextSteps(res);
      return;
    }

    if (choice === "edit") {
      const filmDir = await selectPrompt(
        "Which video would you like to edit?",
        existingFilms.map((d) => ({ value: d, label: d.split("/").pop()!, hint: d })),
      );
      const request = await textPrompt("Describe what to change (in plain English)", {
        placeholder: "e.g. shorter intro, brighter accent, slower terminal",
        validate: (v) => (v.length >= 3 ? null : "Please describe what you'd like to change."),
      });
      const audio = process.env.ELEVENLABS_API_KEY
        ? await selectPrompt("Audio mode", [
            { value: "elevenlabs", label: "ElevenLabs", hint: "Regenerate voice/music if timing changes" },
            { value: "silent", label: "Keep silent / no new audio", hint: "Free, visual edits only" },
          ])
        : "silent";
      console.log(renderSummaryBox([["Film", filmDir], ["Edit", request], ["Audio", audio]]));
      if (!(await confirmPrompt("Start editing now?", true))) return;
      await runCreative(filmDir, { audio, editRequest: request });
      return;
    }

    const format = await selectPrompt(
      "Choose video format",
      [
        { value: "vertical", label: "Vertical (9:16)", hint: "1080×1920 — Shorts, Reels, TikTok, README" },
        { value: "square", label: "Square (1:1)", hint: "1080×1080 — LinkedIn, X / Twitter" },
        { value: "landscape", label: "Landscape (16:9)", hint: "1920×1080 — YouTube, Docs, GitHub PRs" },
      ],
      choice === "repo" ? 0 : 2,
    );
    const captions = await confirmPrompt("Burn synced captions into the video?", true);
    const audio = process.env.ELEVENLABS_API_KEY
      ? await selectPrompt("Audio mode", [
          { value: "elevenlabs", label: "ElevenLabs voice-over + music + SFX", hint: "ELEVENLABS_API_KEY detected" },
          { value: "silent", label: "Silent / captioned mode", hint: "Free — great for muted autoplay" },
        ])
      : "silent";

    if (choice === "repo") {
      const ghRepo = detectGitHubRepo(process.cwd());
      const defaultTarget = ghRepo ? `${ghRepo.owner}/${ghRepo.repo}` : ".";
      const target = await textPrompt("GitHub repo (owner/repo, URL) or local folder", {
        defaultValue: defaultTarget,
        validate: (v) => (v ? null : "Enter a GitHub repo (owner/repo) or folder path."),
      });
      const slug = slugifyTitle(
        target.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "") + "-reel",
      );
      const outDir = defaultOutputDir(slug);
      console.log(
        renderSummaryBox([
          ["Mode", "Repo / README Reel"],
          ["Repository", target],
          ["Format", format],
          ["Captions", captions ? "burned-in + .srt/.vtt" : ".srt/.vtt only"],
          ["Audio", audio === "elevenlabs" ? "ElevenLabs (voice + music + SFX)" : "Silent / captioned"],
          ["Output", outDir],
        ]),
      );
      if (!(await confirmPrompt("Generate this reel now?", true))) return;
      runSync("node", [scriptPath("repo-brief"), target, "--out", outDir], { cwd: process.cwd() });
      await runCreative(outDir, { audio, format, captions });
      return;
    }

    const url = await textPrompt("Live app URL", {
      defaultValue: "http://localhost:3000",
      validate: (v) => (/^https?:\/\//i.test(v) ? null : "Enter a valid http:// or https:// URL."),
    });
    const hostFallback = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "Product Showcase";
      }
    })();
    const title = await textPrompt("Feature or product title (optional)", {
      defaultValue: hostFallback,
    });
    const brief = await textPrompt("What should the video highlight? (optional — press Enter to auto-explore the site)", {
      placeholder: "e.g. Dark mode toggle in Settings",
    });
    const routes = await textPrompt("Specific route(s) to film (optional)", {
      placeholder: "e.g. /settings,/billing — leave blank for AI auto-discovery",
    });
    const outDir = defaultOutputDir(slugifyTitle(title || hostFallback));
    console.log(
      renderSummaryBox([
        ["Mode", "Live App Feature Video"],
        ["URL", url],
        ["Title", title || hostFallback],
        ["Brief", brief || "Auto-explore live site"],
        ["Routes", routes || "AI auto-discovery"],
        ["Format", format],
        ["Captions", captions ? "burned-in + .srt/.vtt" : ".srt/.vtt only"],
        ["Audio", audio === "elevenlabs" ? "ElevenLabs (voice + music + SFX)" : "Silent / captioned"],
        ["Output", outDir],
      ]),
    );
    if (!(await confirmPrompt("Capture & generate this video now?", true))) return;
    const briefArgs = [scriptPath("brief"), "--out", outDir, "--url", url];
    if (title) briefArgs.push("--title", title);
    if (brief) briefArgs.push("--brief", brief);
    if (routes) briefArgs.push("--routes", routes);
    runSync("node", briefArgs, { cwd: process.cwd() });
    runSync("node", [scriptPath("capture"), outDir]);
    await runCreative(outDir, { audio, format, captions });
  } catch (err) {
    if ((err as Error).message === "CANCELLED") return;
    throw err;
  }
}

function printSetupGitHubNextSteps(res: { configPath: string; workflowPath: string; secretsUrl: string | null }) {
  console.log(`\n✓ Created ${res.configPath}`);
  console.log(`✓ Created ${res.workflowPath}`);
  console.log("\nNext steps (2 minutes):");
  console.log("  1. Run `claude setup-token` once and copy your token.");
  if (res.secretsUrl) {
    console.log(`  2. Open ${res.secretsUrl}`);
  } else {
    console.log("  2. Open your repo on GitHub → Settings → Secrets and variables → Actions");
  }
  console.log("     and add secret `CLAUDE_CODE_OAUTH_TOKEN` (optional: `ELEVENLABS_API_KEY` for voice-over & music).");
  console.log("  3. Commit and push these two files, then comment `/gitcut` on any Pull Request!");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      await runWizard();
      return;
    }
    console.log(CLI_HELP);
    return;
  }
  if (cmd === "wizard") {
    await runWizard();
    return;
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(CLI_HELP);
    return;
  }

  if (cmd === "doctor") {
    const { values } = parseArgs({
      args: rest,
      options: { "skip-auth": { type: "boolean", default: false } },
    });
    const report = formatDoctorReport(runDoctorChecks({ skipAuth: values["skip-auth"] }));
    console.log(report.text);
    if (!report.passed) process.exit(1);
    return;
  }

  if (cmd === "setup-github") {
    const { values } = parseArgs({
      args: rest,
      options: {
        dir: { type: "string" },
        url: { type: "string" },
        "auto-preview": { type: "boolean", default: false },
        name: { type: "string" },
        website: { type: "string" },
        accent: { type: "string" },
        login: { type: "boolean", default: false },
        "pipeline-repo": { type: "string" },
        force: { type: "boolean", default: false },
      },
    });
    try {
      const res = runSetupGitHub({
        dir: values.dir,
        url: values.url,
        autoPreview: values["auto-preview"],
        name: values.name,
        website: values.website,
        accent: values.accent,
        withLogin: values.login,
        pipelineRepo: values["pipeline-repo"],
        force: values.force,
      });
      printSetupGitHubNextSteps(res);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    return;
  }

  if (cmd === "init") {
    const { values } = parseArgs({
      args: rest,
      options: {
        url: { type: "string" },
        "auto-preview": { type: "boolean", default: false },
        name: { type: "string" },
        website: { type: "string" },
        accent: { type: "string" },
        login: { type: "boolean", default: false },
        out: { type: "string", default: ".gitcut.json" },
        force: { type: "boolean", default: false },
      },
    });
    const target = resolve(values.out!);
    if (existsSync(target) && !values.force) {
      console.error(`${target} already exists. Pass --force to overwrite.`);
      process.exit(1);
    }
    const cfg = buildInitialConfig({
      url: values.url,
      autoPreview: values["auto-preview"],
      name: values.name,
      website: values.website,
      accent: values.accent,
      withLogin: values.login,
    });
    writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`Created ${target}`);
    return;
  }

  if (cmd === "repo") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        out: { type: "string" },
        ref: { type: "string" },
        accent: { type: "string" },
        format: { type: "string", default: "vertical" },
        captions: { type: "boolean", default: false },
        "plan-only": { type: "boolean", default: false },
        audio: { type: "string", default: "auto" },
      },
    });
    const target = positionals[0] ?? ".";
    const slug = slugifyTitle(
      target
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/\.git$/i, "")
        .replace(/\/$/, "") + "-reel",
    );
    const outDir = values.out ? resolve(values.out) : defaultOutputDir(slug);
    const briefArgs = [scriptPath("repo-brief"), target, "--out", outDir];
    if (values.ref) briefArgs.push("--ref", values.ref);
    if (values.accent) briefArgs.push("--accent", values.accent);
    runSync("node", briefArgs, { cwd: process.cwd() });
    if (values["plan-only"]) return;

    await runCreative(outDir, {
      audio: values.audio!,
      format: values.format,
      captions: values.captions || undefined,
    });
    return;
  }

  if (cmd === "plan" || cmd === "create") {
    const { values } = parseArgs({
      args: rest,
      options: {
        pr: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
        brief: { type: "string" },
        "brief-file": { type: "string" },
        clickup: { type: "string" },
        site: { type: "string" },
        slug: { type: "string" },
        routes: { type: "string" },
        out: { type: "string" },
        "prompt-only": { type: "boolean", default: false },
        "auto-preview": { type: "boolean", default: false },
        response: { type: "string" },
        format: { type: "string" },
        captions: { type: "boolean", default: false },
        audio: { type: "string", default: "auto" },
      },
    });

    const outDir = resolveFeatureDir(values);
    const briefArgs = [scriptPath("brief"), "--out", outDir];
    if (values.pr) briefArgs.push("--pr", values.pr);
    if (values.url) briefArgs.push("--url", values.url);
    if (values["auto-preview"]) briefArgs.push("--auto-preview");
    if (values.title) briefArgs.push("--title", values.title);
    if (values.brief) briefArgs.push("--brief", values.brief);
    if (values["brief-file"]) briefArgs.push("--brief-file", resolve(values["brief-file"]));
    if (values.clickup) briefArgs.push("--clickup", values.clickup);
    if (values.site) {
      const s = values.site;
      briefArgs.push("--site", s.endsWith(".json") || s.includes("/") || existsSync(s) ? resolve(s) : s);
    }
    if (values.slug) briefArgs.push("--slug", values.slug);
    if (values.routes) briefArgs.push("--routes", values.routes);
    if (values["prompt-only"]) briefArgs.push("--prompt-only");
    if (values.response) briefArgs.push("--response", resolve(values.response));

    // Preserve user's cwd so ./.gitcut.json is discovered automatically.
    runSync("node", briefArgs, { cwd: process.cwd() });
    if (cmd === "plan" || values["prompt-only"]) return;

    runSync("node", [scriptPath("capture"), outDir]);
    await runCreative(outDir, {
      pr: values.pr,
      audio: values.audio!,
      format: values.format,
      captions: values.captions || undefined,
    });
    console.log(`\nPreview video ready: ${join(outDir, "creative/out/video.mp4")}`);
    return;
  }

  if (cmd === "capture") {
    const dir = rest[0];
    if (!dir) {
      console.error("usage: gitcut capture <dir>");
      process.exit(2);
    }
    runSync("node", [scriptPath("capture"), resolve(dir)]);
    return;
  }

  if (cmd === "film") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        pr: { type: "string" },
        format: { type: "string" },
        captions: { type: "boolean", default: false },
        audio: { type: "string", default: "auto" },
      },
    });
    const dir = positionals[0];
    if (!dir) {
      console.error("usage: gitcut film <dir> [--pr owner/repo#123] [--format landscape|square|vertical] [--captions] [--audio auto|elevenlabs|silent]");
      process.exit(2);
    }
    await runCreative(dir, {
      pr: values.pr,
      audio: values.audio!,
      format: values.format,
      captions: values.captions || undefined,
    });
    return;
  }

  if (cmd === "edit") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { pr: { type: "string" }, audio: { type: "string", default: "auto" } },
    });
    const [dir, ...words] = positionals;
    const request = words.join(" ").trim();
    if (!dir || !request) {
      console.error('usage: gitcut edit <dir> "<your request>" [--pr owner/repo#123] [--audio auto|elevenlabs|silent]');
      process.exit(2);
    }
    await runCreative(dir, { pr: values.pr, audio: values.audio!, editRequest: request });
    return;
  }

  if (cmd === "render") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { out: { type: "string" } },
    });
    const dir = positionals[0];
    if (!dir) {
      console.error("usage: gitcut render <dir> [--out <file.mp4>]");
      process.exit(2);
    }
    const absDir = resolve(dir);
    const filmDir = join(absDir, "creative/film");
    if (!existsSync(join(filmDir, "package.json"))) {
      console.error(`No Remotion project found at ${filmDir}`);
      process.exit(1);
    }
    runSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: filmDir });
    runSync("npm", ["run", "render"], { cwd: filmDir });
    runSync("node", [scriptPath("subtitles"), absDir]);
    const rendered = join(absDir, "creative/out/video.mp4");
    if (values.out) {
      const dest = resolve(values.out);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(rendered, dest);
      console.log(`Rendered video saved to ${dest}`);
    } else {
      console.log(`Rendered video ready at ${rendered}`);
    }
    return;
  }

  if (cmd === "subtitles") {
    const dir = rest[0];
    if (!dir) {
      console.error("usage: gitcut subtitles <dir>");
      process.exit(2);
    }
    runSync("node", [scriptPath("subtitles"), resolve(dir)]);
    return;
  }

  if (cmd === "notify") {
    runSync("node", [scriptPath("notify"), ...rest]);
    return;
  }

  if (cmd === "discover") {
    if (rest.length < 2) {
      console.error("usage: gitcut discover <site-or-url> <path> [--json]");
      process.exit(2);
    }
    runSync("node", [scriptPath("discover"), ...rest]);
    return;
  }

  console.error(`Unknown command: ${cmd}\nRun "gitcut help" for usage.`);
  process.exit(2);
}

// Re-export slug helper so tests and callers can share it cleanly.
export { slugFor };

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  await main();
}
