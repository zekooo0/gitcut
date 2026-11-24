/**
 * Site configuration loader (zero dependencies).
 * Shared by brief, discover, capture, creative, and youtube-upload.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FormatName } from "./format.ts";

export type ProductInfo = {
  /** Product name used in prompts and video titles (e.g. "Acme App"). */
  name: string;
  /** Short public description used in prompts and video descriptions. */
  description?: string;
  /** Target viewer/persona in prompts (default: "users"). */
  audience?: string;
  /** Public product website URL (used in public video descriptions). */
  website?: string;
};

export type Site = {
  baseUrl: string;
  /** Automatically detect PR preview URLs (Vercel, Netlify, Cloudflare Pages, GitHub Deployments). */
  autoPreview?: boolean;
  /** Default canvas format: landscape (16:9), square (1:1), or vertical (9:16). */
  format?: FormatName;
  /** Burn synced subtitles into voice-over films by default. */
  captions?: boolean;
  viewport?: { width: number; height: number; dpr?: number };
  login?: {
    url: string;
    fields: Record<string, string>; // selector -> ENV VAR NAME (never a literal secret)
    check?: string;
    submit: string;
    /** A selector that exists only after sign-in (optional, checked after the URL test). */
    waitFor?: string;
    /** Path prefix of the signed-out pages (default "/auth/"): sign-in is done when the URL leaves it. */
    loggedOut?: string;
  };
  panel?: string;
  hide?: string[];
  brand?: { logo?: string; accent?: string };
  product?: ProductInfo;
  /** Extra domain/safety rules appended to the planner prompt. */
  safetyRules?: string[];
};

const ROOT = new URL("../..", import.meta.url).pathname;

const resolveSitePath = (siteRef: string): string => {
  if (siteRef.endsWith(".json") || siteRef.includes("/") || existsSync(siteRef)) return siteRef;
  return join(ROOT, "sites", `${siteRef}.json`);
};

/**
 * Load a site configuration from:
 *   1. `cfg.site` (a named file in `sites/<name>.json`, or a direct path to a `.json` file),
 *   2. `<dir>/site.json` (when `dir` is provided and the file exists, e.g. from `.gitcut.json`),
 * and overlay any fields given inline on `cfg`.
 */
export const loadSite = (cfg: { site?: string } & Partial<Site>, dir?: string): Site => {
  let base: Partial<Site> = {};
  if (cfg.site) {
    base = JSON.parse(readFileSync(resolveSitePath(cfg.site), "utf8")) as Site;
  } else if (dir && existsSync(join(dir, "site.json"))) {
    base = JSON.parse(readFileSync(join(dir, "site.json"), "utf8")) as Site;
  }
  const { site: _ignored, ...inline } = cfg;
  const merged = { ...base, ...inline } as Site;
  if (!merged.baseUrl) throw new Error('no baseUrl: set "site" or "baseUrl"');
  return merged;
};

/** Load the resolved Site config for a feature directory (from capture.json + optional site.json). */
export const loadSiteForDir = (dir: string): Site | null => {
  const capPath = join(dir, "capture.json");
  const sitePath = join(dir, "site.json");
  if (existsSync(capPath)) {
    const spec = JSON.parse(readFileSync(capPath, "utf8")) as { site?: string } & Partial<Site>;
    return loadSite(spec, dir);
  }
  if (existsSync(sitePath)) {
    return loadSite({}, dir);
  }
  return null;
};
