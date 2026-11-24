/**
 * Repo / README Reel planner (no browser, no live URL required).
 * Reads a GitHub repository (public or private) or a local repo folder and writes
 * <outDir>/{repo.json, BRIEF.md, context.md, assets/*, brand/*} ready for creative.sh.
 *
 *   node scripts/repo-brief.ts <owner/repo | github-url | local-dir> [--out <dir>] [--ref <branch>] [--accent <#hex>]
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildRepoBriefMarkdown,
  extractReadmeImages,
  parseRepoTarget,
  type RepoMeta,
} from "./lib/repo-context.ts";
import { slugifyTitle } from "./brief.ts";

const ROOT = new URL("..", import.meta.url).pathname;

function optionalGhToken(): string | null {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

async function ghFetch(url: string, accept = "application/vnd.github+json"): Promise<Response> {
  const token = optionalGhToken();
  const headers: Record<string, string> = { Accept: accept, "User-Agent": "gitcut" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers });
}

function findLocalReadme(dir: string): string {
  for (const name of ["README.md", "readme.md", "Readme.md", "README.MD"]) {
    const p = join(dir, name);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return "";
}

function readLocalMeta(dir: string): Partial<RepoMeta> {
  const meta: Partial<RepoMeta> = { name: basename(dir), fullName: basename(dir) };
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
        description?: string;
        homepage?: string;
        license?: string;
        keywords?: string[];
      };
      if (pkg.name) meta.name = pkg.name;
      if (pkg.description) meta.description = pkg.description;
      if (pkg.homepage) meta.homepage = pkg.homepage;
      if (pkg.license) meta.license = pkg.license;
      if (Array.isArray(pkg.keywords)) meta.topics = pkg.keywords;
    } catch { /* ignore */ }
  }
  const gcPath = join(dir, ".gitcut.json");
  if (existsSync(gcPath)) {
    try {
      const gc = JSON.parse(readFileSync(gcPath, "utf8")) as {
        brand?: { logo?: string; accent?: string };
        product?: { name?: string; description?: string; website?: string };
      };
      if (gc.product?.name) meta.name = gc.product.name;
      if (gc.product?.description) meta.description = gc.product.description;
      if (gc.product?.website) meta.homepage = gc.product.website;
      if (gc.brand) meta.brand = gc.brand;
    } catch { /* ignore */ }
  }
  return meta;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      ref: { type: "string" },
      accent: { type: "string" },
    },
  });

  const targetRaw = positionals[0];
  if (!targetRaw) {
    console.error("usage: node scripts/repo-brief.ts <owner/repo | github-url | local-dir> [--out <dir>] [--ref <branch>] [--accent <#hex>]");
    process.exit(2);
  }

  const target = parseRepoTarget(targetRaw);
  let meta: RepoMeta;
  let readme = "";
  let topFiles: string[] = [];
  const copiedAssets: string[] = [];
  let outDir: string;

  if (target.kind === "github") {
    const slug = slugifyTitle(`${target.owner}-${target.repo}-reel`);
    outDir = args.out ? resolve(args.out) : join(ROOT, "public/features", slug);
    mkdirSync(join(outDir, "assets"), { recursive: true });

    const rInfo = await ghFetch(`https://api.github.com/repos/${target.owner}/${target.repo}`);
    if (!rInfo.ok) {
      throw new Error(`GitHub repo ${target.owner}/${target.repo}: ${rInfo.status} ${await rInfo.text()}`);
    }
    const info = (await rInfo.json()) as {
      name: string;
      full_name: string;
      description?: string;
      html_url: string;
      homepage?: string;
      language?: string;
      stargazers_count?: number;
      license?: { spdx_id?: string };
      topics?: string[];
      default_branch: string;
    };
    const ref = args.ref ?? target.ref ?? info.default_branch;

    meta = {
      mode: "repo",
      name: info.name,
      fullName: info.full_name,
      description: info.description || undefined,
      url: info.html_url,
      homepage: info.homepage || undefined,
      language: info.language || undefined,
      stars: info.stargazers_count,
      license: info.license?.spdx_id && info.license.spdx_id !== "NOASSERTION" ? info.license.spdx_id : undefined,
      topics: info.topics,
    };

    const rReadme = await ghFetch(
      `https://api.github.com/repos/${target.owner}/${target.repo}/readme?ref=${encodeURIComponent(ref)}`,
      "application/vnd.github.raw+json",
    );
    if (rReadme.ok) readme = await rReadme.text();

    const rTree = await ghFetch(
      `https://api.github.com/repos/${target.owner}/${target.repo}/contents?ref=${encodeURIComponent(ref)}`,
    );
    if (rTree.ok) {
      const entries = (await rTree.json()) as { name: string; type: string }[];
      if (Array.isArray(entries)) {
        topFiles = entries.slice(0, 30).map((e) => (e.type === "dir" ? `${e.name}/` : e.name));
      }
    }

    // Optional .gitcut.json brand config from the repo
    const rGc = await ghFetch(
      `https://api.github.com/repos/${target.owner}/${target.repo}/contents/.gitcut.json?ref=${encodeURIComponent(ref)}`,
      "application/vnd.github.raw+json",
    );
    if (rGc.ok) {
      try {
        const gc = JSON.parse(await rGc.text()) as { brand?: { logo?: string; accent?: string } };
        if (gc.brand) meta.brand = gc.brand;
      } catch { /* ignore */ }
    }

    // Download brand logo if repo-relative
    if (meta.brand?.logo && !meta.brand.logo.startsWith("http")) {
      const enc = meta.brand.logo.split("/").map(encodeURIComponent).join("/");
      const rLogo = await ghFetch(
        `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`,
        "application/vnd.github.raw+json",
      );
      if (rLogo.ok) {
        const name = basename(meta.brand.logo);
        mkdirSync(join(outDir, "brand"), { recursive: true });
        writeFileSync(join(outDir, "brand", name), Buffer.from(await rLogo.arrayBuffer()));
        meta.brand = { ...meta.brand, logo: `brand/${name}` };
      }
    }

    // Download relative images referenced in the README (max 6)
    for (const imgPath of extractReadmeImages(readme, 6)) {
      const enc = imgPath.split("/").map(encodeURIComponent).join("/");
      const rImg = await ghFetch(
        `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`,
        "application/vnd.github.raw+json",
      );
      if (rImg.ok) {
        const name = basename(imgPath);
        writeFileSync(join(outDir, "assets", name), Buffer.from(await rImg.arrayBuffer()));
        copiedAssets.push(name);
      }
    }
  } else {
    const absPath = resolve(target.path);
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      console.error(`Local repository directory not found: ${absPath}`);
      process.exit(1);
    }
    const localMeta = readLocalMeta(absPath);
    const slug = slugifyTitle(`${localMeta.name ?? basename(absPath)}-reel`);
    outDir = args.out ? resolve(args.out) : join(ROOT, "public/features", slug);
    mkdirSync(join(outDir, "assets"), { recursive: true });

    meta = {
      mode: "repo",
      name: localMeta.name ?? basename(absPath),
      fullName: localMeta.fullName ?? basename(absPath),
      description: localMeta.description,
      homepage: localMeta.homepage,
      license: localMeta.license,
      topics: localMeta.topics,
      brand: localMeta.brand,
    };

    readme = findLocalReadme(absPath);
    topFiles = readdirSync(absPath)
      .filter((n) => !n.startsWith(".") && n !== "node_modules")
      .slice(0, 30)
      .map((n) => (statSync(join(absPath, n)).isDirectory() ? `${n}/` : n));

    if (meta.brand?.logo && !meta.brand.logo.startsWith("http")) {
      const srcLogo = resolve(absPath, meta.brand.logo);
      if (existsSync(srcLogo)) {
        const name = basename(srcLogo);
        mkdirSync(join(outDir, "brand"), { recursive: true });
        copyFileSync(srcLogo, join(outDir, "brand", name));
        meta.brand = { ...meta.brand, logo: `brand/${name}` };
      }
    }

    for (const imgPath of extractReadmeImages(readme, 6)) {
      const srcImg = resolve(absPath, imgPath);
      if (existsSync(srcImg) && statSync(srcImg).isFile()) {
        const name = basename(imgPath);
        copyFileSync(srcImg, join(outDir, "assets", name));
        copiedAssets.push(name);
      }
    }
  }

  if (args.accent) {
    meta.brand = { ...meta.brand, accent: args.accent };
  }

  const brief = buildRepoBriefMarkdown({ meta, readme, topFiles, assets: copiedAssets });
  writeFileSync(join(outDir, "repo.json"), JSON.stringify(meta, null, 2) + "\n");
  writeFileSync(join(outDir, "BRIEF.md"), brief);
  writeFileSync(join(outDir, "context.md"), readme || brief);

  console.log(`${outDir}: repo.json, BRIEF.md (${copiedAssets.length} README assets)`);
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `dir=${outDir}\nname=${meta.name}\n`, { flag: "a" });
  }
}
