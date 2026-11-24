/**
 * Subtitle generator: converts captions.json -> SRT and WebVTT files.
 *
 * Expected captions.json format:
 *   [
 *     { "start": 0.5, "end": 3.2, "text": "Switch themes right from Settings." },
 *     { "start": 3.5, "end": 6.4, "text": "Your preference syncs instantly." }
 *   ]
 */
export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

function formatTime(seconds: number, decimalSep: "," | "."): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(clamped * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${decimalSep}${pad(ms, 3)}`;
}

/** Normalize, sort, and sanitize raw cue entries. */
export function normalizeCues(raw: unknown): CaptionCue[] {
  if (!Array.isArray(raw)) return [];
  const cues: CaptionCue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const start = Number(obj.start);
    const end = Number(obj.end);
    const text = String(obj.text ?? "").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
    cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Render normalized cues as SubRip (.srt). */
export function formatSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${formatTime(c.start, ",")} --> ${formatTime(c.end, ",")}\n${c.text}`)
      .join("\n\n") + (cues.length ? "\n" : "")
  );
}

/** Render normalized cues as WebVTT (.vtt). */
export function formatVtt(cues: CaptionCue[]): string {
  const body = cues
    .map((c) => `${formatTime(c.start, ".")} --> ${formatTime(c.end, ".")}\n${c.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}${body ? "\n" : ""}`;
}
