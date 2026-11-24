/**
 * Parse a PR comment command (/video ...) for the reusable GitHub Actions workflow (pipeline.yml).
 * Keeps the exact same grammar and validation rules as app/commands.js without requiring Probot.
 *
 *   COMMENT_BODY="/video plan url=https://preview.example.com" node scripts/parse-comment.ts
 *
 * Writes multiline-safe outputs to $GITHUB_OUTPUT (when set) and prints JSON to stdout.
 */
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { normalizeFormat, type FormatName } from "./lib/format.ts";
import { normalizeProvider, VALID_PROVIDERS, type ProviderId } from "./lib/providers.ts";
import { normalizeStyle, VALID_STYLES, type StyleName } from "./lib/style.ts";

export type Mode = "plan" | "recapture" | "render" | "edit";
export type Dispatch = {
  mode: Mode;
  routes?: string;
  clickup?: string;
  site?: string;
  url?: string;
  format?: FormatName;
  style?: StyleName;
  provider?: ProviderId;
  model?: string;
  captions?: "on" | "off";
  request?: string;
};
export type ParsedCommand =
  | { kind: "dispatch"; dispatch: Dispatch }
  | { kind: "help"; reply: string }
  | { kind: "error"; message: string; reply: string }
  | { kind: "ignore" };

const VERBS: Record<string, Mode> = {
  "": "plan",
  plan: "plan",
  recapture: "recapture",
  retake: "recapture",
  approve: "render",
  render: "render",
};

export const MAX_REQUEST = 3000;

export const HELP = `**GitCut commands** (people with write access; \`/video\` also works as an alias):

| Command | What it does |
|---|---|
| \`/gitcut\` or \`/gitcut plan\` | Reads this PR, picks pages with AI, captures the live app, then a creative agent (Claude + video-shotcraft) invents and renders a brand-new film. Posts a preview MP4 + contact sheet. |
| \`/gitcut plan routes=/settings/profile\` | Same, targeting the app pages you name. |
| \`/gitcut plan url=https://preview.example.com\` | Capture a specific preview/staging URL instead of the site's default \`baseUrl\`. |
| \`/gitcut plan format=square\` (or \`vertical\`, \`1:1\`, \`9:16\`) | Set the canvas aspect ratio (default \`landscape\` / \`16:9\`). |
| \`/gitcut plan style=editorial-light\` | Pick a visual style: \`auto\` (matches live CSS), \`brand-native\`, \`editorial-light\`, \`soft-studio\`, \`kinetic-bold\`, \`terminal-brutalist\`, or \`dark-glow\`. |
| \`/gitcut plan provider=openai model=gpt-5\` | Pick an AI provider (\`claude\`, \`codex\`, \`openai\`, \`gemini\`, \`opencode\`, \`openrouter\`, \`deepseek\`, \`xai\`, \`groq\`, \`mistral\`, \`ollama\`) and optional model. |
| \`/gitcut plan captions=on\` | Burn synced subtitles into the video (and export \`.srt\`/\`.vtt\`). |
| \`/gitcut plan site=<name>\` | Capture from a named site (\`template/sites/<name>.json\`). |
| \`/gitcut recapture\` | Re-capture from the branch's \`capture.json\`, then generate a new film. |
| \`/gitcut edit <your request>\` | Change the current film in plain words (\`/gitcut edit shorter intro, lighter background\`), keeping the rest. |
| \`/gitcut approve\` | Render the final MP4 from the branch's film (no AI) and post the link. |

Run \`/gitcut\` once your feature is live on staging or a preview deployment.`;

export const canRun = (permission: string | undefined): boolean =>
  ["admin", "maintain", "write"].includes((permission ?? "").trim());

export function parseComment(body: string | undefined): ParsedCommand {
  const line = (body ?? "").trim().split("\n")[0].trim();
  const m = line.match(/^\/(?:gitcut|video)(?:\s+(.*))?$/i);
  if (!m) return { kind: "ignore" };
  const words = (m[1] ?? "").trim().split(/\s+/).filter(Boolean);
  const verb = (words[0] && !words[0].includes("=") ? words.shift()! : "").toLowerCase();
  if (verb === "help") return { kind: "help", reply: HELP };
  if (verb === "edit") {
    const request = (body ?? "").trim().replace(/^\/(?:gitcut|video)\s+edit\b/i, "").trim();
    if (!request) {
      const message = "Say what to change: `/gitcut edit <your request>`.";
      return { kind: "error", message, reply: `${message}\n\n${HELP}` };
    }
    if (request.length > MAX_REQUEST) {
      const message = `The request is too long (max ${MAX_REQUEST} characters).`;
      return { kind: "error", message, reply: `${message}\n\n${HELP}` };
    }
    return { kind: "dispatch", dispatch: { mode: "edit", request } };
  }
  const mode = VERBS[verb];
  if (!mode) {
    const message = `Unknown command \`/gitcut ${verb}\`.`;
    return { kind: "error", message, reply: `${message}\n\n${HELP}` };
  }

  const d: Dispatch = { mode };
  const err = (message: string): ParsedCommand => ({ kind: "error", message, reply: `${message}\n\n${HELP}` });
  for (const w of words) {
    const [k, ...rest] = w.split("=");
    const v = rest.join("=");
    if (!v) return err(`Expected key=value, got \`${w}\`.`);
    if (k === "routes") {
      if (!/^\/[\w\-/,]*$/.test(v)) return err("routes must look like /a,/b");
      d.routes = v;
    } else if (k === "clickup") {
      if (!/^[a-z0-9]+$/i.test(v)) return err("clickup must be a task id");
      d.clickup = v;
    } else if (k === "site") {
      if (!/^[a-z0-9-]+$/.test(v)) return err("site must be a site name like my-app");
      d.site = v;
    } else if (k === "url") {
      if (!/^https?:\/\/[^\s"'`<>]+$/i.test(v)) return err("url must be a valid http(s) URL");
      d.url = v;
    } else if (k === "format") {
      const f = normalizeFormat(v);
      if (!f) return err("format must be landscape (16:9), square (1:1), or vertical (9:16)");
      d.format = f;
    } else if (k === "style") {
      const s = normalizeStyle(v);
      if (!s) return err(`style must be one of: ${VALID_STYLES.join(", ")}`);
      d.style = s;
    } else if (k === "provider") {
      const p = normalizeProvider(v);
      if (!p) return err(`provider must be one of: ${VALID_PROVIDERS.join(", ")}`);
      d.provider = p;
    } else if (k === "model") {
      if (!/^[a-z0-9._:/-]+$/i.test(v)) return err("model contains invalid characters");
      d.model = v;
    } else if (k === "captions") {
      const c = v.toLowerCase();
      if (!["on", "off", "true", "false"].includes(c)) return err("captions must be on or off");
      d.captions = c === "on" || c === "true" ? "on" : "off";
    } else {
      return err(`Unknown option \`${k}\`.`);
    }
  }
  if (mode !== "plan" && (d.routes || d.clickup || d.site || d.url || d.format || d.style || d.provider || d.model || d.captions)) {
    return err("routes=, clickup=, site=, url=, format=, style=, provider=, model= and captions= only apply to `/gitcut plan`.");
  }
  return { kind: "dispatch", dispatch: d };
}

function writeOutput(file: string, name: string, value: string) {
  if (!value.includes("\n")) {
    appendFileSync(file, `${name}=${value}\n`);
    return;
  }
  const delim = `FV_${randomBytes(8).toString("hex")}`;
  appendFileSync(file, `${name}<<${delim}\n${value}\n${delim}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = parseComment(process.env.COMMENT_BODY ?? process.argv[2] ?? "");
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    writeOutput(out, "kind", res.kind);
    if (res.kind === "dispatch") {
      writeOutput(out, "mode", res.dispatch.mode);
      if (res.dispatch.routes) writeOutput(out, "routes", res.dispatch.routes);
      if (res.dispatch.clickup) writeOutput(out, "clickup", res.dispatch.clickup);
      if (res.dispatch.site) writeOutput(out, "site", res.dispatch.site);
      if (res.dispatch.url) writeOutput(out, "url", res.dispatch.url);
      if (res.dispatch.format) writeOutput(out, "format", res.dispatch.format);
      if (res.dispatch.style) writeOutput(out, "style", res.dispatch.style);
      if (res.dispatch.provider) writeOutput(out, "provider", res.dispatch.provider);
      if (res.dispatch.model) writeOutput(out, "model", res.dispatch.model);
      if (res.dispatch.captions) writeOutput(out, "captions", res.dispatch.captions);
      if (res.dispatch.request) writeOutput(out, "request", res.dispatch.request);
    } else if (res.kind === "help" || res.kind === "error") {
      writeOutput(out, "reply", res.reply);
    }
  }
  console.log(JSON.stringify(res));
}
