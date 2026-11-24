/**
 * Export creative/captions.json -> creative/out/captions.srt & captions.vtt.
 *   node scripts/subtitles.ts <featureDir>
 * Exits 0 cleanly if no captions.json exists yet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatSrt, formatVtt, normalizeCues } from "./lib/subtitles.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/subtitles.ts <featureDir>");
  process.exit(2);
}

const src = join(dir, "creative", "captions.json");
if (!existsSync(src)) {
  console.log("No creative/captions.json found; skipping subtitle export.");
  process.exit(0);
}

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(src, "utf8"));
} catch (err) {
  console.warn(`::warning::Could not parse ${src}: ${(err as Error).message}`);
  process.exit(0);
}

const cues = normalizeCues(raw);
if (!cues.length) {
  console.log("creative/captions.json has no valid cues; skipping subtitle export.");
  process.exit(0);
}

const outDir = join(dir, "creative", "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "captions.srt"), formatSrt(cues));
writeFileSync(join(outDir, "captions.vtt"), formatVtt(cues));
console.log(`Exported ${cues.length} subtitle cues -> captions.srt, captions.vtt`);
