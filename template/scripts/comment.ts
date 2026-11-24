/**
 * The PR comment for each stage.
 *   node scripts/comment.ts creative public/features/<slug> <branchUrl> <previewUrl>
 *                              (env EDIT_REQUEST set: the preview of an edit)
 *   node scripts/comment.ts render   public/features/<slug> <videoUrl> [youtubeUrl]   (env YT_PRIVACY: its visibility)
 *   node scripts/comment.ts failed   public/features/<slug> <runUrl> [stage]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [mode, dir, link, extra] = process.argv.slice(2); // extra = preview URL | failed stage
if (!mode || !dir || !link) {
  console.error("usage: node scripts/comment.ts creative|render|failed <featureDir> <url> [previewUrl|stage]");
  process.exit(2);
}
const MARK = "<!-- gitcut -->";
const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
// "What changed" from the planner, without its title line
const facts = read("BRIEF.md").replace(/^# .*\n/, "").trim();
const notes = read("creative/NOTES.md").replace(/^# .*\n/, "").trim();
const notesBlock = notes
  ? `<details><summary>Direction, shot cards, storyboard and known flaws (from the agent)</summary>\n\n${notes}\n\n</details>`
  : "";

// an edit: the request (quoted) and the agent's list of changes
const request = (process.env.EDIT_REQUEST ?? "").trim();
const quote = (t: string) => t.split("\n").map((l) => `> ${l}`).join("\n");
const changes = read("creative/CHANGES.md").replace(/^# .*\n/, "").trim();

let body = "";
if (mode === "creative" && request) {
  body = `${MARK}
### ✏️ Feature video: edited preview ready

**[Watch the preview MP4](${extra})** · the film code: **[branch](${link})**

**Your request**

${quote(request)}

**What changed**

${changes || "(the agent wrote no list of changes)"}

**Next:** \`/video approve\` to render the final MP4, or \`/video edit <more changes>\`.`;
} else if (mode === "creative") {
  body = `${MARK}
### 🎬 Feature video: preview ready

**[Watch the preview MP4](${extra})** · contact sheet \`creative/sheet.png\` and the film code: **[branch](${link})**

${facts}

${notesBlock}

**Next:** watch the preview. Then comment one of these:
- \`/video approve\`: render the final MP4 from the branch (no AI).
- \`/video edit <your request>\`: change this film in plain words; the rest stays.
- \`/video recapture\`: capture again (after an edit to \`capture.json\` on the branch), then a new film.
- \`/video plan\`: plan again from scratch; every plan makes a brand-new film.`;
} else if (mode === "render") {
  const privacy = (process.env.YT_PRIVACY ?? "").trim();
  const youtubeBlock = extra
    ? `
**[Watch on YouTube](${extra})**${privacy && privacy !== "public" ? ` (${privacy}: change the visibility in YouTube Studio to share it)` : ""}
`
    : "";
  body = `${MARK}
### ✅ Feature video rendered

**[Download the MP4](${link})**
${youtubeBlock}

${notesBlock}`;
} else {
  body = `${MARK}
### ⚠️ Feature video: ${extra ?? "a step"} failed

See the [workflow run](${link}). A capture failure saves \`captures/_error-<shot>.png\` and the
clickable labels in the log; fix the selector in \`capture.json\` on the branch, then \`/video recapture\`.`;
}
console.log(body);
