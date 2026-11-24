/**
 * Auto-detect a PR's live preview deployment URL (Vercel, Netlify, Cloudflare Pages,
 * Render, Fly.io, Railway, or any GitHub Deployment environment URL).
 */
export type DeploymentCandidate = {
  environment?: string;
  state?: string;
  environmentUrl?: string;
  createdAt?: string;
};

export type CommentCandidate = {
  author?: string;
  body?: string;
  createdAt?: string;
};

const PREVIEW_HOST_PATTERNS = [
  /https:\/\/[a-z0-9.-]+\.vercel\.app(?:\/[^\s)"'>]*)?/gi,
  /https:\/\/[a-z0-9.-]+\.netlify\.app(?:\/[^\s)"'>]*)?/gi,
  /https:\/\/[a-z0-9.-]+\.pages\.dev(?:\/[^\s)"'>]*)?/gi,
  /https:\/\/[a-z0-9.-]+\.onrender\.com(?:\/[^\s)"'>]*)?/gi,
  /https:\/\/[a-z0-9.-]+\.fly\.dev(?:\/[^\s)"'>]*)?/gi,
  /https:\/\/[a-z0-9.-]+\.up\.railway\.app(?:\/[^\s)"'>]*)?/gi,
];

const NON_APP_URL = /vercel\.com\/|app\.netlify\.com\/|dash\.cloudflare\.com\/|github\.com\//i;

function normalizeOrigin(raw: string): string | null {
  try {
    const cleaned = raw.replace(/[).,;:'"]+$/, "");
    const u = new URL(cleaned);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (NON_APP_URL.test(u.href)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Pick the best preview deployment URL from GitHub deployments and PR comments.
 * Prefers successful GitHub Deployment statuses (Preview/staging first), then falls back
 * to preview bot comments (newest first).
 */
export function detectPreviewUrl(input: {
  deployments?: DeploymentCandidate[];
  comments?: CommentCandidate[];
}): string | null {
  const deps = (input.deployments ?? [])
    .filter((d) => d.state === "success" && d.environmentUrl)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  // Prefer preview/staging deployments over production if both exist.
  const isPreviewEnv = (env?: string) => /\b(preview|staging|dev|pr)\b/i.test(env ?? "");
  const previewFirst = [...deps.filter((d) => isPreviewEnv(d.environment)), ...deps.filter((d) => !isPreviewEnv(d.environment))];
  for (const d of previewFirst) {
    const url = normalizeOrigin(d.environmentUrl!);
    if (url) return url;
  }

  // Fallback: scan PR comments newest-first for preview URLs.
  const comments = [...(input.comments ?? [])].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  for (const c of comments) {
    const body = c.body ?? "";
    // Explicit labeled markdown links like [Visit Preview](https://...) or [Deploy Preview](https://...)
    const labeled = body.match(/\[(?:Visit Preview|Deploy Preview|Preview|View Preview|Open Preview)\]\((https?:\/\/[^\s)]+)\)/i);
    if (labeled?.[1]) {
      const url = normalizeOrigin(labeled[1]);
      if (url) return url;
    }
    for (const re of PREVIEW_HOST_PATTERNS) {
      re.lastIndex = 0;
      const m = re.exec(body);
      if (m?.[0]) {
        const url = normalizeOrigin(m[0]);
        if (url) return url;
      }
    }
  }
  return null;
}
