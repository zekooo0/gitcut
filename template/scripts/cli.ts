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
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { slugifyTitle } from "./brief.ts";
import { detectGitHubRepo, formatDoctorReport, runDoctorChecks } from "./lib/doctor.ts";
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
  title?: string;
  brief?: string;
}): string {
  if (args.out) return resolve(args.out);
  if (args.slug) return defaultOutputDir(args.slug);
  if (args.pr) {
    const safe = args.pr.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
    return defaultOutputDir(safe);
  }
  const title = args.title?.trim() || args.brief?.trim().split("\n")[0] || "gitcut-video";
  return defaultOutputDir(slugifyTitle(title));
}

async function runCreative(
  dir: string,
  opts: { pr?: string; audio: string; format?: string; captions?: boolean; editRequest?: string },
) {
  const absDir = resolve(dir);
  const { mode, stop } = await startElevenProxyIfNeeded(opts.audio);
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AUDIO_MODE: mode,
      RUNNER_TEMP: process.env.RUNNER_TEMP || tmpdir(),
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
  }
}

async function runWizard() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, fallback = "") => {
    const suffix = fallback ? ` [${fallback}]` : "";
    const ans = (await rl.question(`${q}${suffix}: `)).trim();
    return ans || fallback;
  };
  try {
    console.log("\n🎬 Welcome to GitCut — what would you like to do?\n");
    console.log("  1) Make a 15-30s Repo Reel from a GitHub repo or local folder (easiest, no browser needed)");
    console.log("  2) Make a feature video from a live website / local dev server");
    console.log("  3) Set up GitHub Actions (/gitcut PR videos) in this repository");
    console.log("  4) Check my local setup (doctor)\n");
    const choice = await ask("Choose 1-4", "1");

    if (choice === "4") {
      rl.close();
      const report = formatDoctorReport(runDoctorChecks());
      console.log("\n" + report.text);
      if (!report.passed) process.exit(1);
      return;
    }

    if (choice === "3") {
      const name = await ask("Product name", "My App");
      const previewAns = (await ask("Use automatic Vercel/Netlify/Cloudflare PR preview URLs? (y/n)", "y")).toLowerCase();
      const autoPreview = previewAns.startsWith("y");
      const url = autoPreview ? "" : await ask("Staging URL", "https://staging.example.com");
      const loginAns = (await ask("Does your app require email/password login? (y/n)", "n")).toLowerCase();
      rl.close();
      const res = runSetupGitHub({ name, autoPreview, url: url || undefined, withLogin: loginAns.startsWith("y") });
      printSetupGitHubNextSteps(res);
      return;
    }

    const fmtChoice = await ask("Video format: 1) vertical 9:16  2) square 1:1  3) landscape 16:9", choice === "1" ? "1" : "3");
    const format = fmtChoice === "1" ? "vertical" : fmtChoice === "2" ? "square" : "landscape";
    const capAns = (await ask("Burn synced captions into the video? (y/n)", "y")).toLowerCase();
    const captions = capAns.startsWith("y");
    const audio = process.env.ELEVENLABS_API_KEY ? "auto" : "silent";

    if (choice === "1") {
      const target = await ask("GitHub repo (owner/repo or URL) or local folder", ".");
      rl.close();
      const slug = slugifyTitle(
        target.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "") + "-reel",
      );
      const outDir = defaultOutputDir(slug);
      runSync("node", [scriptPath("repo-brief"), target, "--out", outDir], { cwd: process.cwd() });
      await runCreative(outDir, { audio, format, captions });
      console.log(`\nRepository reel ready: ${join(outDir, "creative/out/video.mp4")}`);
      return;
    }

    const url = await ask("Live app URL", "http://localhost:3000");
    const title = await ask("Feature title", "New feature");
    const brief = await ask("What does this feature do? (1-2 sentences)");
    const routes = await ask("Specific route(s) to film (optional, e.g. /settings)", "");
    rl.close();
    if (!brief) {
      console.error("A short description is required.");
      process.exit(1);
    }
    const outDir = defaultOutputDir(slugifyTitle(title));
    const briefArgs = [scriptPath("brief"), "--out", outDir, "--url", url, "--title", title, "--brief", brief];
    if (routes) briefArgs.push("--routes", routes);
    runSync("node", briefArgs, { cwd: process.cwd() });
    runSync("node", [scriptPath("capture"), outDir]);
    await runCreative(outDir, { audio, format, captions });
    console.log(`\nPreview video ready: ${join(outDir, "creative/out/video.mp4")}`);
  } finally {
    rl.close();
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
    console.log(`\nRepository reel ready: ${join(outDir, "creative/out/video.mp4")}`);
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
