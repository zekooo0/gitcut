/**
 * Pure logic of the GitCut App: parse a command, decide what to dispatch.
 * No GitHub calls here, so it is unit-tested without a network (test/commands.test.js).
 */

/** @typedef {{ mode: "plan"|"recapture"|"render"|"edit", routes?: string, clickup?: string, site?: string, url?: string, format?: string, style?: string, provider?: string, model?: string, captions?: string, request?: string }} Dispatch */
/** @typedef {{ kind: "dispatch", dispatch: Dispatch } | { kind: "help" } | { kind: "error", message: string } | null} Command */

const VERBS = {
  "": "plan",
  plan: "plan",
  recapture: "recapture",
  retake: "recapture",
  approve: "render",
  render: "render",
};

const FORMAT_ALIASES = {
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

const VALID_STYLES = ["auto", "brand-native", "editorial-light", "soft-studio", "kinetic-bold", "terminal-brutalist", "dark-glow"];

const PROVIDER_ALIASES = {
  auto: "auto",
  claude: "claude",
  "claude-code": "claude",
  codex: "codex",
  "openai-codex": "codex",
  "gemini-cli": "gemini-cli",
  opencode: "opencode",
  anthropic: "anthropic",
  openai: "openai",
  gemini: "gemini",
  google: "gemini",
  openrouter: "openrouter",
  deepseek: "deepseek",
  xai: "xai",
  grok: "xai",
  groq: "groq",
  mistral: "mistral",
  ollama: "ollama",
  "openai-compatible": "openai-compatible",
};

/** Longest edit request passed to the workflow (dispatch inputs are small). */
export const MAX_REQUEST = 3000;

/**
 * Parse the first line of a comment.
 *   /video                      -> plan
 *   /video plan routes=/a,/b clickup=86abc site=my-app
 *   /video recapture            -> capture again from the branch (no planning LLM), then a new film
 *   /video approve              -> render
 *   /video edit <free text>     -> change the existing film as asked (the text may span lines)
 *   /video help
 * @param {string} body
 * @returns {Command}
 */
export function parseCommand(body) {
  const line = (body ?? "").trim().split("\n")[0].trim();
  const m = line.match(/^\/(?:gitcut|video)(?:\s+(.*))?$/i);
  if (!m) return null;
  const words = (m[1] ?? "").trim().split(/\s+/).filter(Boolean);
  const verb = (words[0] && !words[0].includes("=") ? words.shift() : "").toLowerCase();
  if (verb === "help") return { kind: "help" };
  if (verb === "edit") {
    // everything after "/gitcut edit" or "/video edit", all lines: the request in the user's own words
    const request = (body ?? "").trim().replace(/^\/(?:gitcut|video)\s+edit\b/i, "").trim();
    if (!request) return { kind: "error", message: "Say what to change: `/gitcut edit <your request>`." };
    if (request.length > MAX_REQUEST)
      return { kind: "error", message: `The request is too long (max ${MAX_REQUEST} characters).` };
    return { kind: "dispatch", dispatch: { mode: "edit", request } };
  }
  const mode = VERBS[verb];
  if (!mode) return { kind: "error", message: `Unknown command \`/gitcut ${verb}\`.` };

  /** @type {Dispatch} */
  const d = { mode };
  for (const w of words) {
    const [k, ...rest] = w.split("=");
    const v = rest.join("=");
    if (!v) return { kind: "error", message: `Expected key=value, got \`${w}\`.` };
    if (k === "routes") {
      if (!/^\/[\w\-/,]*$/.test(v)) return { kind: "error", message: `routes must look like /a,/b` };
      d.routes = v;
    } else if (k === "clickup") {
      if (!/^[a-z0-9]+$/i.test(v)) return { kind: "error", message: `clickup must be a task id` };
      d.clickup = v;
    } else if (k === "site") {
      if (!/^[a-z0-9-]+$/.test(v)) return { kind: "error", message: `site must be a site name like my-app` };
      d.site = v;
    } else if (k === "url") {
      if (!/^https?:\/\/[^\s"'`<>]+$/i.test(v)) return { kind: "error", message: `url must be a valid http(s) URL` };
      d.url = v;
    } else if (k === "format") {
      const f = FORMAT_ALIASES[v.toLowerCase()];
      if (!f) return { kind: "error", message: `format must be landscape (16:9), square (1:1), or vertical (9:16)` };
      d.format = f;
    } else if (k === "style") {
      const s = v.toLowerCase().replace(/_/g, "-");
      if (!VALID_STYLES.includes(s)) return { kind: "error", message: `style must be one of: ${VALID_STYLES.join(", ")}` };
      d.style = s;
    } else if (k === "provider") {
      const p = PROVIDER_ALIASES[v.toLowerCase().replace(/_/g, "-")];
      if (!p) return { kind: "error", message: `Unknown provider \`${v}\`. Try claude, codex, openai, gemini, opencode, openrouter, deepseek, xai, groq, mistral, or ollama.` };
      d.provider = p;
    } else if (k === "model") {
      if (!/^[a-z0-9._:/-]+$/i.test(v)) return { kind: "error", message: `model contains invalid characters` };
      d.model = v;
    } else if (k === "captions") {
      const c = v.toLowerCase();
      if (!["on", "off", "true", "false"].includes(c))
        return { kind: "error", message: `captions must be on or off` };
      d.captions = c === "on" || c === "true" ? "on" : "off";
    } else return { kind: "error", message: `Unknown option \`${k}\`.` };
  }
  if (mode !== "plan" && (d.routes || d.clickup || d.site || d.url || d.format || d.style || d.provider || d.model || d.captions))
    return { kind: "error", message: "routes=, clickup=, site=, url=, format=, style=, provider=, model= and captions= only apply to `/gitcut plan`." };
  return { kind: "dispatch", dispatch: d };
}

/** Only people who can push to the repo may start a run (each run spends LLM and CI minutes). */
export const canRun = (permission) => ["admin", "maintain", "write"].includes(permission);

/**
 * Should a pull_request event start a plan by itself?
 *   AUTO_PLAN=label        (default) when the trigger label is added
 *   AUTO_PLAN=feat-merged  also when a PR whose title starts with "feat" is merged
 *   AUTO_PLAN=off
 */
export function autoPlan(event, { mode = "label", label = "gitcut" } = {}) {
  if (mode === "off") return false;
  if (event.action === "labeled") return event.label?.name === label;
  if (mode === "feat-merged" && event.action === "closed")
    return Boolean(event.pull_request?.merged) && /^feat(\(|:|!)/i.test(event.pull_request?.title ?? "");
  return false;
}

/** The inputs of the workflow_dispatch call. Every value is a string (GitHub requires it). */
export function workflowInputs({ owner, repo, number }, d) {
  const inputs = { mode: d.mode, pr: `${owner}/${repo}#${number}` };
  if (d.routes) inputs.routes = d.routes;
  if (d.clickup) inputs.clickup = d.clickup;
  if (d.site) inputs.site = d.site;
  if (d.url) inputs.url = d.url;
  if (d.format) inputs.format = d.format;
  if (d.style) inputs.style = d.style;
  if (d.provider) inputs.provider = d.provider;
  if (d.model) inputs.model = d.model;
  if (d.captions) inputs.captions = d.captions;
  if (d.request) inputs.request = d.request;
  return inputs;
}

export const HELP = `**GitCut commands** (people with write access; \`/video\` also works as an alias):

| Command | What it does |
|---|---|
| \`/gitcut\` or \`/gitcut plan\` | Reads this PR (and optional ClickUp task), picks the pages with the AI, captures the live app, then a creative agent (Claude + video-shotcraft) invents and renders a brand-new film. Posts a preview MP4 + a contact sheet. Takes about 10-20 min. |
| \`/gitcut plan routes=/settings/profile\` | The same, on the app pages you name. |
| \`/gitcut plan url=https://preview.example.com\` | Capture a specific preview/staging URL instead of the site's default \`baseUrl\`. |
| \`/gitcut plan format=square\` (or \`vertical\`, \`1:1\`, \`9:16\`) | Set the output canvas aspect ratio (default \`landscape\` / \`16:9\`). |
| \`/gitcut plan style=editorial-light\` | Pick a visual style: \`auto\` (matches live CSS), \`brand-native\`, \`editorial-light\`, \`soft-studio\`, \`kinetic-bold\`, \`terminal-brutalist\`, or \`dark-glow\`. |
| \`/gitcut plan provider=openai model=gpt-5\` | Choose the AI provider (\`claude\`, \`codex\`, \`openai\`, \`gemini\`, \`opencode\`, \`openrouter\`, \`deepseek\`, \`xai\`, \`groq\`, \`mistral\`, \`ollama\`) and optional model. |
| \`/gitcut plan captions=on\` | Burn synced subtitles into the video (and export \`.srt\`/\`.vtt\`). |
| \`/gitcut plan site=<name>\` | Capture from a named site (\`template/sites/<name>.json\` in the GitCut repo) instead of \`.gitcut.json\` or \`sites/repos.json\`. |
| \`/gitcut recapture\` | Captures again from the video branch's \`capture.json\` (after a manual edit), then a new film. |
| \`/gitcut edit <your request>\` | Changes the current film as you ask, in plain words (\`/gitcut edit shorter intro, lighter background\`), and keeps the rest. Posts a new preview. Repeat as needed. |
| \`/gitcut approve\` | Renders the final MP4 from the branch's film (no AI) and posts the link here (and on YouTube / ClickUp if configured). |

Run \`/gitcut\` after the feature is live on your staging/preview environment: the robot films the real app.`;
