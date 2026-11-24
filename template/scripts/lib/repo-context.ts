/**
 * Pure helpers for Repo / README Reel mode (`gitcut repo`).
 */

export type RepoTarget =
  | { kind: "github"; owner: string; repo: string; ref?: string }
  | { kind: "local"; path: string };

export type RepoMeta = {
  mode: "repo";
  name: string;
  fullName: string;
  description?: string;
  url?: string;
  homepage?: string;
  language?: string;
  stars?: number;
  license?: string;
  topics?: string[];
  brand?: { logo?: string; accent?: string };
};

/** Parse `owner/repo`, a GitHub repo URL, or a local filesystem path. */
export function parseRepoTarget(raw: string): RepoTarget {
  const s = raw.trim();
  const urlMatch = s.match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree\/([^/?#]+))?)?\/?$/i);
  if (urlMatch) {
    return { kind: "github", owner: urlMatch[1], repo: urlMatch[2], ...(urlMatch[3] ? { ref: urlMatch[3] } : {}) };
  }
  const slugMatch = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (slugMatch && !s.startsWith(".") && !s.startsWith("/")) {
    return { kind: "github", owner: slugMatch[1], repo: slugMatch[2] };
  }
  return { kind: "local", path: s || "." };
}

/** Extract relative image paths referenced in a README (Markdown + HTML img tags). */
export function extractReadmeImages(markdown: string, limit = 6): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (p: string) => {
    const clean = p.trim().split(/[?#]/)[0].replace(/^\.\//, "");
    if (!clean || /^https?:\/\//i.test(clean) || clean.startsWith("data:") || clean.includes("..")) return;
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(clean)) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    found.push(clean);
  };

  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    push(m[1]);
    if (found.length >= limit) return found;
  }
  for (const m of markdown.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    push(m[1]);
    if (found.length >= limit) return found;
  }
  return found;
}

/** Build the structured BRIEF.md for Repo / README Reel mode. */
export function buildRepoBriefMarkdown(opts: {
  meta: RepoMeta;
  readme: string;
  topFiles: string[];
  assets: string[];
}): string {
  const { meta, readme, topFiles, assets } = opts;
  const stats = [
    meta.language ? `Language: ${meta.language}` : "",
    typeof meta.stars === "number" ? `Stars: ${meta.stars.toLocaleString("en-US")}` : "",
    meta.license ? `License: ${meta.license}` : "",
    meta.topics?.length ? `Topics: ${meta.topics.slice(0, 8).join(", ")}` : "",
  ].filter(Boolean);

  return [
    `# ${meta.name}`,
    "",
    meta.url ? `Repository: ${meta.url}` : `Repository: ${meta.fullName}`,
    meta.homepage ? `Homepage: ${meta.homepage}` : "",
    meta.description ? `Summary: ${meta.description}` : "",
    stats.length ? stats.join(" · ") : "",
    "",
    "## Top-level files",
    topFiles.length ? topFiles.map((f) => `- ${f}`).join("\n") : "(not listed)",
    "",
    assets.length ? "## Real images from README (in ./input/assets/)\n" + assets.map((a) => `- ${a}`).join("\n") + "\n" : "",
    "## README excerpt",
    readme.slice(0, 8000).trim() || "(empty README)",
    "",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}
