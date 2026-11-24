/**
 * Video canvas format presets: landscape (16:9), square (1:1), vertical (9:16).
 */
export type FormatName = "landscape" | "square" | "vertical";

export type FormatSpec = {
  name: FormatName;
  ratio: string;
  width: number;
  height: number;
  guidance: string;
};

export const FORMATS: Record<FormatName, FormatSpec> = {
  landscape: {
    name: "landscape",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    guidance: "1920x1080 (16:9 landscape) — standard widescreen for YouTube, docs, and GitHub PRs.",
  },
  square: {
    name: "square",
    ratio: "1:1",
    width: 1080,
    height: 1080,
    guidance:
      "1080x1080 (1:1 square) — social feeds (LinkedIn, X). Crop tightly onto key UI regions from positions.json rather than shrinking the full desktop window; use large, high-contrast typography.",
  },
  vertical: {
    name: "vertical",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    guidance:
      "1080x1920 (9:16 vertical) — Shorts, Reels, TikTok. Compose vertically: bold headline in the upper third, tightly zoomed/cropped UI card in the middle, captions/callouts below (keep the bottom 220px clear of UI overlays). Never shrink a wide desktop screen into tiny unreadable strips.",
  },
};

const ALIASES: Record<string, FormatName> = {
  landscape: "landscape",
  "16:9": "landscape",
  wide: "landscape",
  square: "square",
  "1:1": "square",
  vertical: "vertical",
  "9:16": "vertical",
  portrait: "vertical",
  shorts: "vertical",
};

/** Normalize a format string or alias; returns null on unknown values. */
export function normalizeFormat(value: string | undefined): FormatName | null {
  if (!value) return "landscape";
  return ALIASES[value.trim().toLowerCase()] ?? null;
}

/** Return the FormatSpec for a format string/alias (defaults to landscape). */
export function resolveFormat(value: string | undefined): FormatSpec {
  const name = normalizeFormat(value);
  if (!name) throw new Error(`Unknown format "${value}". Use landscape (16:9), square (1:1), or vertical (9:16).`);
  return FORMATS[name];
}
