/**
 * Brief: a PR (or standalone text brief) -> <outDir>/{capture.json, BRIEF.md, site.json}
 *
 *   PR mode:
 *     node scripts/brief.ts --pr owner/repo#123 [--url https://preview.example.com]
 *                           [--clickup <taskId>] [--site <name|path>] [--slug <slug>]
 *                           [--routes /a,/b] [--out <dir>] [--prompt-only] [--response <file>]
 *
 *   Standalone mode (no GitHub PR required):
 *     node scripts/brief.ts --url http://localhost:3000 --title "Dark mode" \
 *                           --brief "Users can toggle dark mode in Settings." \
 *                           [--brief-file notes.md] [--site <name|path>] [--routes /settings] [--out <dir>]
 *
 * Pass 1 (LLM): which app routes show this feature?   (skip with --routes)
 * Discovery:    the real labels on each route (signed-in or public browser)
 * Pass 2 (LLM): capture.json (what to film) + the facts of the change, following docs/authoring.md.
 *               The story is NOT planned here: the creative agent writes the film.
 * Lint:         the capture is well-formed; one LLM repair round on errors.
 *
 * Env: OPENAI_API_KEY [+ OPENAI_BASE_URL] or ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN; BRIEF_MODEL,
 *      GITHUB_TOKEN (falls back to `gh auth token`, PR mode only), CLICKUP_TOKEN (optional),
 *      CAPTURE_STORAGE_STATE or login env vars from the site config (discovery signs in).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadSite, type Site } from "./lib/site.ts";
import { detectPreviewUrl, type CommentCandidate, type DeploymentCandidate } from "./lib/preview-url.ts";
import { slugFor } from "./slug.ts";

const ROOT = new URL("..", import.meta.url).pathname;

/* ---------------- lint: a well-formed capture ---------------- */
export type Shot = { name: string; kind: string; url?: string; elements?: Record<string, unknown> };
export const lintCapture = (capture: { shots?: Shot[] }) => {
  const errs: string[] = [];
  const shots = capture?.shots ?? [];
  if (!shots.length) return ["capture.shots is empty"];
  if (shots[0].kind !== "window" || !shots[0].url) errs.push(`capture.shots[0] must be kind "window" with a url`);
  const names = new Set<string>();
  shots.forEach((s, i) => {
    if (!s.name) errs.push(`shots[${i}] has no name`);
    else if (names.has(s.name)) errs.push(`shot name "${s.name}" is used twice`);
    names.add(s.name);
    if (!["window", "panel", "element"].includes(s.kind)) errs.push(`shot ${s.name}: unknown kind "${s.kind}"`);
  });
  if (!shots.some((s) => Object.keys(s.elements ?? {}).length))
    errs.push("no shot names any element: name the parts of the feature the film can point at");
  return errs;
};

export const slugifyTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "") || "gitcut-video";

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      pr: { type: "string" },
      url: { type: "string" },
      title: { type: "string" },
      brief: { type: "string" },
      "brief-file": { type: "string" },
      clickup: { type: "string" },
      site: { type: "string" }, // named site in template/sites/, or path to a .json file
      slug: { type: "string" },
      routes: { type: "string" },
      "prompt-only": { type: "boolean", default: false },
      "auto-preview": { type: "boolean", default: false },
      response: { type: "string" },
      out: { type: "string" },
    },
  });

  const standaloneBriefText = [
    args.brief?.trim(),
    args["brief-file"] ? readFileSync(args["brief-file"], "utf8").trim() : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!args.pr && !standaloneBriefText) {
    console.error(
      "usage:\n" +
        "  node scripts/brief.ts --pr owner/repo#123 [--url <baseUrl>] [--site <name|path>] [--routes /a,/b]\n" +
        "  node scripts/brief.ts --url <baseUrl> --title <title> --brief <text> [--brief-file <md>] [--site <name|path>] [--routes /a,/b]",
    );
    process.exit(2);
  }

  /* ---------------- inputs ---------------- */
  const ghToken = () =>
    process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

  /** fetch with retries on 5xx, 429 and network errors (GitHub has short outages: 503s). */
  const retryFetch = async (url: string, init: RequestInit, tries = 4): Promise<Response> => {
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(url, init);
        if ((r.status < 500 && r.status !== 429) || i >= tries) return r;
        console.warn(`${url}: ${r.status}, retry ${i}/${tries - 1}`);
      } catch (e) {
        if (i >= tries) throw e;
        console.warn(`${url}: ${(e as Error).message}, retry ${i}/${tries - 1}`);
      }
      await new Promise((res) => setTimeout(res, 2000 * 2 ** (i - 1))); // 2, 4, 8 s
    }
  };

  const gh = async (path: string) => {
    const r = await retryFetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${ghToken()}`, Accept: "application/vnd.github+json" },
    });
    if (!r.ok) throw new Error(`GitHub ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };

  /** Fetch a file from the source repo at a given git ref, returning null on 404. */
  const ghFile = async (repo: string, filePath: string, ref: string): Promise<Buffer | null> => {
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const r = await retryFetch(
      `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${ghToken()}`, Accept: "application/vnd.github.raw+json" } },
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${repo}/${filePath}: ${r.status} ${await r.text()}`);
    return Buffer.from(await r.arrayBuffer());
  };

  type PR = { repo: string; number: number; title: string; body: string; branch: string; headSha: string; url: string; files: string };
  const getPR = async (ref: string): Promise<PR> => {
    const m = ref.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
    if (!m) throw new Error(`--pr must look like owner/repo#123, got ${ref}`);
    const [, repo, n] = m;
    const pr = await gh(`/repos/${repo}/pulls/${n}`);
    const files = (await gh(`/repos/${repo}/pulls/${n}/files?per_page=100`)) as {
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }[];
    // file list in full; patches of UI files only, capped, so the prompt stays small
    let budget = 24000;
    const parts = files.map((f) => {
      let s = `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`;
      if (f.patch && /\.(tsx|jsx|vue|svelte)$/.test(f.filename) && budget > 0) {
        const p = f.patch.slice(0, Math.min(3000, budget));
        budget -= p.length;
        s += `\n\`\`\`diff\n${p}\n\`\`\``;
      }
      return s;
    });
    return {
      repo,
      number: Number(n),
      title: pr.title,
      body: pr.body ?? "",
      branch: pr.head.ref,
      headSha: pr.head.sha,
      url: pr.html_url,
      files: parts.join("\n"),
    };
  };

  /** Query GitHub Deployments + PR comments to auto-detect a PR preview URL (Vercel/Netlify/etc.). */
  const findPreviewUrl = async (prObj: PR): Promise<string | null> => {
    const deployments: DeploymentCandidate[] = [];
    try {
      const deps = (await gh(`/repos/${prObj.repo}/deployments?sha=${encodeURIComponent(prObj.headSha)}&per_page=10`)) as {
        id: number;
        environment?: string;
        created_at?: string;
      }[];
      for (const dep of deps.slice(0, 6)) {
        const statuses = (await gh(`/repos/${prObj.repo}/deployments/${dep.id}/statuses?per_page=3`).catch(() => [])) as {
          state?: string;
          environment_url?: string;
          created_at?: string;
        }[];
        const latest = statuses[0];
        if (latest) {
          deployments.push({
            environment: dep.environment,
            state: latest.state,
            environmentUrl: latest.environment_url,
            createdAt: latest.created_at ?? dep.created_at,
          });
        }
      }
    } catch { /* deployments permission optional */ }

    const comments: CommentCandidate[] = [];
    try {
      const rawComments = (await gh(`/repos/${prObj.repo}/issues/${prObj.number}/comments?per_page=50`)) as {
        user?: { login?: string };
        body?: string;
        created_at?: string;
      }[];
      for (const c of rawComments) {
        comments.push({ author: c.user?.login, body: c.body, createdAt: c.created_at });
      }
    } catch { /* comments optional */ }

    return detectPreviewUrl({ deployments, comments });
  };

  const clickupId = (pr: PR | null) =>
    args.clickup ??
    (pr ? (pr.body + " " + pr.branch).match(/app\.clickup\.com\/t\/(?:\d+\/)?([a-z0-9]+)/i)?.[1] : undefined) ??
    (pr ? (pr.body + " " + pr.branch).match(/\bCU-([a-z0-9]+)/i)?.[1] : undefined);

  const getTask = async (id: string | undefined) => {
    if (!id) return null;
    if (!process.env.CLICKUP_TOKEN) {
      console.warn(`ClickUp task ${id}: CLICKUP_TOKEN not set, skipped`);
      return null;
    }
    const r = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
      headers: { Authorization: process.env.CLICKUP_TOKEN },
    });
    if (!r.ok) {
      console.warn(`ClickUp task ${id}: ${r.status}, skipped`);
      return null;
    }
    const t = await r.json();
    return { id, name: t.name as string, description: (t.text_content as string)?.slice(0, 6000) ?? "" };
  };

  const discover = (siteArg: string, path: string) => {
    const out = execFileSync("node", [join(ROOT, "scripts/discover.ts"), siteArg, path, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
    const d = JSON.parse(out);
    // trim: the model needs labels, not geometry noise
    const lab = (xs: { text: string; name?: string; href?: string; role?: string }[]) =>
      xs.map(
        (x) =>
          `${x.text} [${x.role}${x.name ? `, name "${x.name}"` : ""}]${x.href ? ` -> ${x.href}` : ""}`,
      );
    return {
      path,
      url: d.url,
      title: d.title,
      headings: d.headings.map((h: { text: string }) => h.text),
      tabsAndButtons: lab([...d.tabs, ...d.buttons]).slice(0, 90),
      inputs: d.inputs,
      text: (d.text as string).slice(0, 2500),
    };
  };

  /* ---------------- LLM ---------------- */
  const MODEL = process.env.BRIEF_MODEL;
  const llm = async (system: string, user: string): Promise<string> => {
    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL || "claude-sonnet-4-5",
          max_tokens: 8000,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic: ${r.status} ${await r.text()}`);
      const j = await r.json();
      return j.content.map((c: { text?: string }) => c.text ?? "").join("");
    }
    if (process.env.OPENAI_API_KEY) {
      const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL || "gpt-6.1-terra",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!r.ok) throw new Error(`OpenAI: ${r.status} ${await r.text()}`);
      return (await r.json()).choices[0].message.content;
    }
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      // A Claude subscription token works only through the Claude Code CLI, not the HTTP API.
      // One turn, no tools: a plain completion. The user prompt goes on stdin (it is large).
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      const out = execFileSync(
        "claude",
        ["-p", "--model", MODEL || "sonnet", "--system-prompt", system, "--max-turns", "1",
         "--output-format", "json"],
        { input: user, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 },
      );
      const j = JSON.parse(out);
      if (j.is_error) throw new Error(`Claude Code: ${j.result ?? out.slice(0, 500)}`);
      return j.result as string;
    }
    throw new Error(
      "no LLM key: set ANTHROPIC_API_KEY, OPENAI_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (or use --prompt-only / --response)",
    );
  };

  const parseJson = (text: string) => {
    const t = text.replace(/```(?:json)?/g, "");
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error(`LLM answer has no JSON object:\n${text.slice(0, 500)}`);
    return JSON.parse(t.slice(a, b + 1));
  };

  /* ---------------- resolve source & site ---------------- */
  const pr = args.pr ? await getPR(args.pr) : null;
  const standaloneTitle = args.title?.trim() || standaloneBriefText.split("\n")[0].replace(/^#\s*/, "").slice(0, 80) || "New Feature";
  const slugGuess = args.slug ?? (pr ? slugFor(pr.repo, pr.branch) : slugifyTitle(standaloneTitle));
  const outDir = args.out ?? join(ROOT, "public/features", slugGuess);
  mkdirSync(join(outDir, "prompts"), { recursive: true });

  // Copy a local brand logo (relative to a local site json) into <outDir>/brand/.
  const copyLocalLogo = (s: Site, configDir: string) => {
    if (!s.brand?.logo || s.brand.logo.startsWith("http")) return;
    const candidate = isAbsolute(s.brand.logo) ? s.brand.logo : resolve(configDir, s.brand.logo);
    if (!existsSync(candidate)) return;
    const logoName = basename(candidate);
    mkdirSync(join(outDir, "brand"), { recursive: true });
    copyFileSync(candidate, join(outDir, "brand", logoName));
    s.brand = { ...s.brand, logo: `brand/${logoName}` };
  };

  // Site resolution order:
  //   1. --site <name|path>
  //   2. template/sites/repos.json[<owner/repo>] (PR mode)
  //   3. .gitcut.json in the source repo at the PR branch (PR mode)
  //   4. ./.gitcut.json in the local working directory (standalone mode)
  //   5. minimal site synthesized from --url <baseUrl>
  const repoSites = JSON.parse(readFileSync(join(ROOT, "sites/repos.json"), "utf8")) as Record<string, string>;
  let siteName: string | undefined = args.site ?? (pr ? repoSites[pr.repo] : undefined);
  let site: Site;
  let persistedSitePath: string | null = null;

  if (siteName) {
    site = loadSite({ site: siteName, ...(args.url ? { baseUrl: args.url } : {}) });
    if (siteName.endsWith(".json") || siteName.includes("/") || existsSync(siteName)) {
      copyLocalLogo(site, dirname(resolve(siteName)));
      persistedSitePath = join(outDir, "site.json");
      writeFileSync(persistedSitePath, JSON.stringify(site, null, 2) + "\n");
      siteName = undefined; // use site.json in outDir instead of a machine-local path
    } else if (args.url) {
      // --url overrides baseUrl on a named site: persist resolved site.json for capture/creative
      persistedSitePath = join(outDir, "site.json");
      writeFileSync(persistedSitePath, JSON.stringify(site, null, 2) + "\n");
      siteName = undefined;
    }
  } else if (pr) {
    const raw = await ghFile(pr.repo, ".gitcut.json", pr.branch);
    if (raw) {
      const inRepoSite = JSON.parse(raw.toString("utf8")) as Partial<Site>;
      if (args.url) {
        inRepoSite.baseUrl = args.url;
      } else if (inRepoSite.autoPreview || args["auto-preview"] || !inRepoSite.baseUrl) {
        const detected = await findPreviewUrl(pr);
        if (detected) {
          console.log(`preview URL detected: ${detected}`);
          inRepoSite.baseUrl = detected;
        }
      }
      if (inRepoSite.brand?.logo && !inRepoSite.brand.logo.startsWith("http")) {
        const logoBytes = await ghFile(pr.repo, inRepoSite.brand.logo, pr.branch).catch(() => null);
        if (logoBytes) {
          const logoName = basename(inRepoSite.brand.logo);
          mkdirSync(join(outDir, "brand"), { recursive: true });
          writeFileSync(join(outDir, "brand", logoName), logoBytes);
          inRepoSite.brand = { ...inRepoSite.brand, logo: `brand/${logoName}` };
        }
      }
      persistedSitePath = join(outDir, "site.json");
      writeFileSync(persistedSitePath, JSON.stringify(inRepoSite, null, 2) + "\n");
      site = loadSite({ site: persistedSitePath });
    } else {
      const preview = args.url ?? (await findPreviewUrl(pr));
      if (preview) {
        if (!args.url) console.log(`preview URL detected: ${preview}`);
        site = loadSite({ baseUrl: preview, panel: "auto" });
        persistedSitePath = join(outDir, "site.json");
        writeFileSync(persistedSitePath, JSON.stringify(site, null, 2) + "\n");
      } else {
        console.error(
          `No site config or preview deployment found for ${pr.repo}. Add .gitcut.json to the repo, map it in template/sites/repos.json, or pass --site <name> / --url <baseUrl>.`,
        );
        process.exit(4);
      }
    }
  } else {
    const localCfg = join(process.cwd(), ".gitcut.json");
    if (existsSync(localCfg)) {
      site = loadSite({ site: localCfg, ...(args.url ? { baseUrl: args.url } : {}) });
      copyLocalLogo(site, process.cwd());
    } else if (args.url) {
      site = loadSite({ baseUrl: args.url, panel: "auto" });
    } else {
      console.error("No site config found. Pass --url <baseUrl>, --site <name|path>, or add .gitcut.json.");
      process.exit(4);
    }
    persistedSitePath = join(outDir, "site.json");
    writeFileSync(persistedSitePath, JSON.stringify(site, null, 2) + "\n");
  }

  const siteRef = persistedSitePath ?? siteName!;
  const task = await getTask(clickupId(pr));
  const authoring = readFileSync(join(ROOT, "docs/authoring.md"), "utf8");
  const productName = site.product?.name ?? pr?.repo.split("/").pop() ?? new URL(site.baseUrl).hostname;
  const productDesc = site.product?.description ? `, ${site.product.description}` : "";
  const audience = site.product?.audience ?? "users";
  const extraSafety = site.safetyRules?.length
    ? `\n\n## Site-specific safety rules\n${site.safetyRules.map((r) => `- ${r}`).join("\n")}`
    : "";

  const sourceBlock = pr
    ? `# Pull request ${pr.repo}#${pr.number}: ${pr.title}
${pr.url}

## Description
${pr.body || "(empty)"}

## Changed files
${pr.files}
${task ? `\n# ClickUp task ${task.id}: ${task.name}\n${task.description}\n` : ""}`
    : `# Feature brief: ${standaloneTitle}
URL: ${site.baseUrl}

${standaloneBriefText}
${task ? `\n# ClickUp task ${task.id}: ${task.name}\n${task.description}\n` : ""}`;

  // Save standalone context so creative.sh does not need GitHub / gh pr view.
  if (!pr) {
    writeFileSync(join(outDir, "context.md"), `# ${standaloneTitle}\n\n${standaloneBriefText}\n`);
  }

  const SYSTEM =
    `You decide what to film for a product feature video of ${productName}${productDesc}. You answer with ONE JSON ` +
    "object and nothing else. You only use routes and labels that you were given; you never invent a label.";

  // pass 1: routes
  let routes: string[];
  if (args.routes) routes = args.routes.split(",").map((s) => s.trim());
  else {
    const nav = discover(siteRef, "/");
    const navLinks = nav.tabsAndButtons.filter((x: string) => x.includes(" -> "));
    // (each line: visible text [role, name "<accessible name>"] -> route)
    const p1 = `${sourceBlock}

# App navigation (label -> route)
${navLinks.join("\n")}

Which 1-4 app routes show what changed, as ${audience} would see it? Prefer the page
where the feature lives, then pages it changes. Answer:
{"routes": ["/path", ...], "why": "<one sentence>"}`;
    writeFileSync(join(outDir, "prompts/pass1.md"), p1);
    if (args["prompt-only"] && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      console.log(`prompt-only: wrote ${outDir}/prompts/pass1.md; re-run with --routes to continue`);
      process.exit(0);
    }
    const a1 = parseJson(await llm(SYSTEM, p1));
    routes = a1.routes;
    console.log(`routes: ${routes.join(", ")}  (${a1.why})`);
  }

  // discovery
  const pages = routes.map((r) => discover(siteRef, r));
  writeFileSync(join(outDir, "prompts/discovery.json"), JSON.stringify(pages, null, 1));

  // pass 2: the brief
  const captureHeader = siteName ? `"site": "${siteName}", ` : "";
  const p2 = `${sourceBlock}

# Pages (live discovery)
${pages
  .map(
    (p) => `## ${p.path}  — <title> "${p.title}"
Headings: ${p.headings.join(" | ")}
Tabs, links and buttons: ${p.tabsAndButtons.join(" | ")}
Inputs: ${JSON.stringify(p.inputs)}
Visible text (excerpt):
${p.text}`,
  )
  .join("\n\n")}

# How to capture
${authoring}${extraSafety}

# Your answer
One JSON object:
{
  "feature": "<the feature's name as the app shows it, 1-5 words>",
  "facts": ["<3-6 short facts: what changed for ${audience} and why it matters, only from the brief/PR>"],
  "capture": { ${captureHeader}"shots": [ ... ] }
}`;
  writeFileSync(join(outDir, "prompts/pass2.md"), p2);

  let answer: Record<string, any>;
  if (args.response) answer = parseJson(readFileSync(args.response, "utf8"));
  else if (args["prompt-only"]) {
    console.log(`prompt-only: wrote ${outDir}/prompts/pass2.md`);
    process.exit(0);
  } else answer = parseJson(await llm(SYSTEM, p2));

  let errs = lintCapture(answer.capture);
  if (errs.length && !args.response) {
    console.warn(`lint found ${errs.length} problems; asking for one repair:\n- ${errs.join("\n- ")}`);
    const fix = `${p2}\n\n# Your previous answer\n${JSON.stringify(answer)}\n\n# Problems to fix\n- ${errs.join("\n- ")}\n\nAnswer with the corrected JSON object.`;
    answer = parseJson(await llm(SYSTEM, fix));
    errs = lintCapture(answer.capture);
  }

  /* ---------------- write ---------------- */
  const slug = slugGuess;
  const facts = (answer.facts ?? []).map((f: string) => `- ${f}`).join("\n");
  writeFileSync(join(outDir, "capture.json"), JSON.stringify(answer.capture, null, 2) + "\n");
  const sourceLine = pr ? `Source: ${pr.url}` : `Source: ${site.baseUrl}`;
  writeFileSync(
    join(outDir, "BRIEF.md"),
    `# ${answer.feature}\n\n${sourceLine}${task ? `\nClickUp: https://app.clickup.com/t/${task.id}` : ""}\n` +
      `Routes: ${routes.join(", ")}\n\n## What changed\n\n${facts}\n` +
      (errs.length ? `\n## Open problems (fix before capture)\n\n- ${errs.join("\n- ")}\n` : ""),
  );
  console.log(`${outDir}: capture.json, BRIEF.md${errs.length ? `  (${errs.length} lint problems left)` : ""}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\ndir=${outDir}\n`, { flag: "a" });
  if (errs.length) process.exit(3);
  if (!existsSync(join(outDir, "captures"))) console.log(`next: node scripts/capture.ts ${outDir}`);
}
