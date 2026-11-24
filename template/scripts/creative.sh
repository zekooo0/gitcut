#!/usr/bin/env bash
# Creative film: a Claude Code agent with the video-shotcraft skill writes and renders a new
# Remotion film from the robot's captures.
#
#   scripts/creative.sh <featureDir> [owner/repo#123]
#   EDIT_REQUEST="<text>" scripts/creative.sh ...   edit mode: change the existing creative/film
#
# Reads   <dir>/BRIEF.md (facts), capture.json, positions.json, layout.json, captures/*.png
# Writes  <dir>/creative/{BRIEF.md, NOTES.md, film/, sheet.png, out/video.mp4 (not committed)}
# Needs   CLAUDE_CODE_OAUTH_TOKEN (subscription) or ANTHROPIC_API_KEY; GH_TOKEN when PR is passed.
#         CREATIVE_MODEL (default sonnet), CREATIVE_TIMEOUT (default 40m).
#         Optional: ElevenLabs proxy (scripts/eleven.ts serve) on ELEVEN_URL.
#         AUDIO_MODE=auto (default: use proxy if reachable, else silent) | elevenlabs | silent.
set -euo pipefail
D="${1:?usage: creative.sh <featureDir> [owner/repo#123]}"
PR="${2:-}"
HERE="$(pwd)"                           # template/
SKILL="$(cd "$HERE/../creative/shotcraft" && pwd)"
C="$D/creative"
RUNNER_TEMP="${RUNNER_TEMP:-/tmp}"

# Use compiled dist/*.js when installed via npm (Node disallows TS type-stripping inside node_modules).
if [ -f "$HERE/dist/lib/site.js" ]; then
  SCRIPTS_DIR="$HERE/dist"
  SCRIPT_EXT="js"
else
  SCRIPTS_DIR="$HERE/scripts"
  SCRIPT_EXT="ts"
fi

# Detect mode: repo reel (repo.json, no Playwright captures) vs UI feature film (capture.json).
REPO_MODE=0
if [ -f "$D/repo.json" ] && [ ! -f "$D/capture.json" ]; then
  REPO_MODE=1
fi

# Read brand/product/format/style/provider metadata from repo.json (repo mode) or site config (UI mode).
SITE_META=$(SCRIPTS_DIR="$SCRIPTS_DIR" SCRIPT_EXT="$SCRIPT_EXT" REPO_MODE="$REPO_MODE" \
  VIDEO_FORMAT="${VIDEO_FORMAT:-}" VIDEO_STYLE="${VIDEO_STYLE:-}" CAPTIONS_MODE="${CAPTIONS_MODE:-}" \
  AI_PROVIDER="${CREATIVE_PROVIDER:-${AI_PROVIDER:-}}" AI_MODEL="${CREATIVE_MODEL:-${AI_MODEL:-}}" \
  node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  const { loadSiteForDir } = await import(pathToFileURL(path.join(process.env.SCRIPTS_DIR, `lib/site.${process.env.SCRIPT_EXT}`)).href);
  const { resolveFormat } = await import(pathToFileURL(path.join(process.env.SCRIPTS_DIR, `lib/format.${process.env.SCRIPT_EXT}`)).href);
  const { resolveStyle } = await import(pathToFileURL(path.join(process.env.SCRIPTS_DIR, `lib/style.${process.env.SCRIPT_EXT}`)).href);
  const { resolveProvider } = await import(pathToFileURL(path.join(process.env.SCRIPTS_DIR, `lib/providers.${process.env.SCRIPT_EXT}`)).href);
  const dir = process.argv[1];
  const isRepo = process.env.REPO_MODE === "1";
  const s = isRepo
    ? JSON.parse(fs.readFileSync(path.join(dir, "repo.json"), "utf8"))
    : (loadSiteForDir(dir) ?? {});
  const themePath = path.join(dir, "theme.json");
  const theme = fs.existsSync(themePath) ? JSON.parse(fs.readFileSync(themePath, "utf8")) : null;
  const defaultFmt = isRepo ? "vertical" : (s.format || "landscape");
  const fmt = resolveFormat(process.env.VIDEO_FORMAT || defaultFmt);
  const styleSpec = resolveStyle(process.env.VIDEO_STYLE || s.style || "auto", {
    theme,
    seed: s.fullName || s.name || s.product?.name || path.basename(dir),
    accentOverride: s.brand?.accent || undefined,
  });
  const providerSpec = resolveProvider(process.env.AI_PROVIDER || s.provider || "auto", {
    model: process.env.AI_MODEL || s.model || undefined,
    purpose: "creative",
  });
  const capEnv = (process.env.CAPTIONS_MODE || "").trim().toLowerCase();
  const captions = capEnv ? ["on", "true", "1", "yes"].includes(capEnv) : Boolean(s.captions);
  console.log(JSON.stringify({
    logo: s.brand?.logo ?? "",
    accent: styleSpec.palette.accent,
    audience: isRepo ? "developers" : (s.product?.audience ?? "users"),
    format: fmt.name,
    width: fmt.width,
    height: fmt.height,
    ratio: fmt.ratio,
    formatGuidance: fmt.guidance,
    styleName: styleSpec.name,
    styleLabel: styleSpec.label,
    providerId: providerSpec.id,
    providerLabel: providerSpec.info.label,
    providerKind: providerSpec.info.kind,
    model: providerSpec.model,
    captions,
  }));
' "$D")
LOGO=$(jq -r .logo <<<"$SITE_META")
ACCENT=$(jq -r .accent <<<"$SITE_META")
AUDIENCE=$(jq -r .audience <<<"$SITE_META")
FMT_NAME=$(jq -r .format <<<"$SITE_META")
FMT_WIDTH=$(jq -r .width <<<"$SITE_META")
FMT_HEIGHT=$(jq -r .height <<<"$SITE_META")
FMT_GUIDANCE=$(jq -r .formatGuidance <<<"$SITE_META")
STYLE_NAME=$(jq -r .styleName <<<"$SITE_META")
STYLE_LABEL=$(jq -r .styleLabel <<<"$SITE_META")
PROVIDER_ID=$(jq -r .providerId <<<"$SITE_META")
PROVIDER_LABEL=$(jq -r .providerLabel <<<"$SITE_META")
PROVIDER_KIND=$(jq -r .providerKind <<<"$SITE_META")
RESOLVED_MODEL=$(jq -r .model <<<"$SITE_META")
CAPTIONS_ON=$(jq -r .captions <<<"$SITE_META")

# Resolve audio mode: auto uses ElevenLabs if the local proxy is up, otherwise silent/captioned mode.
ELEVEN_ENDPOINT="${ELEVEN_URL:-http://127.0.0.1:8790}"
AUDIO_MODE="${AUDIO_MODE:-auto}"
if [ "$AUDIO_MODE" = "auto" ]; then
  if curl -sf "$ELEVEN_ENDPOINT/usage" >/dev/null 2>&1; then
    AUDIO_MODE="elevenlabs"
  else
    AUDIO_MODE="silent"
  fi
elif [ "$AUDIO_MODE" = "elevenlabs" ]; then
  curl -sf "$ELEVEN_ENDPOINT/usage" >/dev/null || { echo "::error::ElevenLabs proxy is not running."; exit 1; }
elif [ "$AUDIO_MODE" != "silent" ]; then
  echo "::error::Unknown AUDIO_MODE=$AUDIO_MODE (expected auto, elevenlabs, or silent)."
  exit 1
fi

MODE_LABEL=$([ "$REPO_MODE" = "1" ] && echo "Repo Reel" || echo "Feature Video")
[ -n "${EDIT_REQUEST:-}" ] && MODE_LABEL="$MODE_LABEL (Edit)"
echo ""
echo "🎬 GitCut · $MODE_LABEL"
echo "   Canvas   $FMT_NAME (${FMT_WIDTH}x${FMT_HEIGHT}) · captions $([ "$CAPTIONS_ON" = "true" ] && echo on || echo off)"
echo "   Style    $STYLE_LABEL ($STYLE_NAME)"
echo "   Audio    $([ "$AUDIO_MODE" = "elevenlabs" ] && echo "ElevenLabs (voice-over, music & SFX)" || echo "silent / captioned mode")"
echo "   AI       $PROVIDER_LABEL${RESOLVED_MODEL:+ · $RESOLVED_MODEL}"
echo "   Output   $D"
echo ""

if [ -n "${EDIT_REQUEST:-}" ]; then
  # Edit: keep the film; rebuild only the inputs next to it.
  [ -f "$C/film/package.json" ] || { echo "No film on the branch to edit: run /video (plan) first."; exit 1; }
  rm -rf "$C/input" "$C/out"
else
  # A new plan replaces the old film; keep nothing from a previous agent run.
  rm -rf "$C"
fi
mkdir -p "$C/input/brand" "$C/out"
if [ -z "${EDIT_REQUEST:-}" ]; then
  # Empty Remotion project (setup only, no look), installed before the agent starts.
  cp -r "$HERE/../creative/starter" "$C/film"
  chmod -R u+w "$C/film"
  # Set starter composition dimensions to the chosen canvas format.
  FMT_WIDTH="$FMT_WIDTH" FMT_HEIGHT="$FMT_HEIGHT" node --input-type=module -e '
    import fs from "node:fs";
    const p = process.argv[1];
    const src = fs.readFileSync(p, "utf8")
      .replace(/width=\{1920\}/, `width={${process.env.FMT_WIDTH}}`)
      .replace(/height=\{1080\}/, `height={${process.env.FMT_HEIGHT}}`);
    fs.writeFileSync(p, src);
  ' "$C/film/src/Root.tsx"
  T0=$(date +%s); ( cd "$C/film" && npm ci --no-audit --no-fund --loglevel=error >/dev/null ); echo "  ✓ Setup       Remotion starter ready ($(( $(date +%s) - T0 )) s)"
fi

cp "$D/BRIEF.md" "$C/input/facts.md"                 # the planner's facts; no storyline
# Copy central brand files and any repo-fetched brand files (e.g. from .gitcut.json)
shopt -s nullglob
for f in public/brand/* "$D"/brand/*; do cp "$f" "$C/input/brand/"; done
shopt -u nullglob
cp "$HERE/../creative/SHOTS.md" "$C/input/shots.md"   # the allowed shot cards

if [ "$REPO_MODE" = "1" ]; then
  mkdir -p "$C/input/assets"
  cp "$D/repo.json" "$C/input/repo.json"
  if [ -f "$D/context.md" ]; then
    cp "$D/context.md" "$C/input/readme.md"
  else
    cp "$D/BRIEF.md" "$C/input/readme.md"
  fi
  shopt -s nullglob
  for f in "$D"/assets/*; do cp "$f" "$C/input/assets/"; done
  shopt -u nullglob
else
  mkdir -p "$C/input/captures"
  # only this plan's shots (the branch may still hold captures of an older plan)
  for n in $(jq -r '.shots[].name' "$D/capture.json"); do cp "$D/captures/$n.png" "$C/input/captures/"; done
  cp "$D"/{capture,positions,layout}.json "$C/input/"
  [ -f "$D/theme.json" ] && cp "$D/theme.json" "$C/input/theme.json" || true
  if [ -n "$PR" ]; then
    [[ "$PR" =~ ^([^/]+/[^#]+)#([0-9]+)$ ]]
    for i in 1 2 3 4; do  # GitHub has short 5xx outages: retry
      gh pr view "${BASH_REMATCH[2]}" -R "${BASH_REMATCH[1]}" --json title,body \
        -q '"# \(.title)\n\n\(.body)"' > "$C/input/pr.md" && break
      [ "$i" = 4 ] && exit 1; sleep $((2 ** i))
    done
  elif [ -f "$D/context.md" ]; then
    cp "$D/context.md" "$C/input/pr.md"
  else
    cp "$D/BRIEF.md" "$C/input/pr.md"
  fi
fi
TITLE=$(head -1 "$C/input/facts.md" | sed 's/^# //')

if [ -n "${EDIT_REQUEST:-}" ]; then
  # the request is the user's raw text: written to a file, never through sed or a shell string
  printf '%s\n' "$EDIT_REQUEST" > "$C/input/request.md"
  TEMPLATE="$HERE/../creative/EDIT.md"; BRIEF_FILE=EDIT.md
  TASK="Read ./EDIT.md and ./input/request.md and carry out the edit completely, without asking questions. Finish only when ./out/video.mp4 is rendered from the changed ./film and ./CHANGES.md is written."
else
  if [ "$REPO_MODE" = "1" ]; then
    TEMPLATE="$HERE/../creative/REPO.md"
  else
    TEMPLATE="$HERE/../creative/BRIEF.md"
  fi
  BRIEF_FILE=BRIEF.md
  TASK="Read ./BRIEF.md and carry it out completely, end to end, without asking questions. FIRST analyze the website/repo inputs and write ./STRATEGY.md, THEN build ./film strictly following your strategy. Finish only when ./STRATEGY.md, ./out/video.mp4, ./film/package.json (with render script), ./NOTES.md, and ./captions.json all exist."
fi

# Render the brief template safely with Node (avoids sed escaping bugs on &, \, |, or quotes).
TITLE="$TITLE" SKILL="$SKILL" LOGO="$LOGO" ACCENT="$ACCENT" AUDIENCE="$AUDIENCE" \
ELEVEN_CMD="node $SCRIPTS_DIR/eleven.$SCRIPT_EXT" AUDIO_MODE="$AUDIO_MODE" \
FMT_WIDTH="$FMT_WIDTH" FMT_HEIGHT="$FMT_HEIGHT" FMT_GUIDANCE="$FMT_GUIDANCE" CAPTIONS_ON="$CAPTIONS_ON" \
SCRIPTS_DIR="$SCRIPTS_DIR" SCRIPT_EXT="$SCRIPT_EXT" STYLE_NAME="$STYLE_NAME" FEATURE_DIR="$D" \
node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  const { resolveStyle, renderStyleBriefSection } = await import(
    pathToFileURL(path.join(process.env.SCRIPTS_DIR, `lib/style.${process.env.SCRIPT_EXT}`)).href
  );
  const { TITLE, SKILL, LOGO, ACCENT, AUDIENCE, ELEVEN_CMD, AUDIO_MODE, FMT_WIDTH, FMT_HEIGHT, FMT_GUIDANCE, CAPTIONS_ON, STYLE_NAME, FEATURE_DIR } = process.env;
  const themePath = path.join(FEATURE_DIR, "theme.json");
  const theme = fs.existsSync(themePath) ? JSON.parse(fs.readFileSync(themePath, "utf8")) : null;
  const styleSpec = resolveStyle(STYLE_NAME, { theme, accentOverride: ACCENT });
  const visualDirectionSection = renderStyleBriefSection(styleSpec, theme);
  const logoBase = LOGO ? path.basename(LOGO) : "";
  const brandNote = logoBase
    ? `the product logos (${logoBase} is the configured logo).`
    : "optional product logos (none configured; use clean typography for the brand mark).";

  const formatSection = `## Canvas format
Target composition size: **${FMT_WIDTH}x${FMT_HEIGHT}** in \`film/src/Root.tsx\`.
${FMT_GUIDANCE}`;

  const captionsSection = CAPTIONS_ON === "true"
    ? `## Burned-in captions (enabled)
Render clean, high-contrast synced captions near the lower safe area throughout the film so every
key line reads clearly even when muted. Keep them concise (1-2 short lines at a time) and mirror
their exact timings in \`./captions.json\`.`
    : `## Subtitles export
Write \`./captions.json\` with the exact start/end seconds and text of each spoken line (or main
on-screen caption beat) so CI can export \`.srt\` and \`.vtt\` subtitle tracks alongside the MP4.`;

  const soundEleven = `## Sound: voice-over, music and SFX (ElevenLabs)
The film is led by a voice-over. Make all sound with \`${ELEVEN_CMD}\` (it prints each file\x27s length
in seconds; the voice is fixed, you do not choose it):
- \`${ELEVEN_CMD} tts "<line>" film/public/voice/vo1.mp3 --prev "<line before>" --next "<line after>"\`
- \`${ELEVEN_CMD} music "<mood, tempo, instruments>" <seconds> film/public/music.mp3\`
- \`${ELEVEN_CMD} sfx "<sound>" film/public/sfx/<name>.mp3 [seconds]\`
- \`${ELEVEN_CMD} usage\` shows what this run has spent; each kind has a cap per run.

How:
- Script first: a short story (hook, the change for ${AUDIENCE}, payoff), English, about
  2.3 words per second, every claim from facts.md, pr.md or the captures. One file per line,
  with the neighbouring lines as --prev/--next.
- Time the film to the measured voice lengths: each scene starts just before its line. Leave
  about 0.5 s before the first line and 2-3 s after the last one for the end card.
- Music: ONE track, generated after the timing is fixed, as long as the film. Describe mood and
  structure only, never a brand or artist name (the API refuses them). It can come back longer
  than asked: trim it and fade the last 1-2 s.
- SFX: a few short ones on cuts and clicks (whoosh, click, impact, riser). Not on every frame.
- Mix: the voice is always on top and every word stays clear.
  - Music about 12 dB under the voice while it speaks.
  - SFX files arrive already levelled (peak -20 dBFS, under the voice). Play them at volume 1
    or lower; never raise an SFX above 1 and never stack two at the same moment.
  - SFX go in the gaps between lines, not over words. Risers, impacts and whooshes never play
    under a line; only a soft click may fall on a word, at volume 0.5 or lower.
  - No clipping. Check with ffmpeg \`volumedetect\` on a speech window, a gap, and each loud SFX.
- If a call fails, read the error, fix the request and retry. Never ship the film without the
  voice-over and the music.`;

  const soundSilent = `## Sound: silent / captioned mode
Audio generation is disabled for this run (no ElevenLabs proxy). Design this as a crisp,
self-contained **silent product film** built for muted autoplay (PR previews, changelogs, docs,
and social feeds):
- Lead with clear, punchy on-screen captions, kinetic typography, and visual callouts so the
  whole story reads effortlessly without sound.
- Pace each scene so every headline and caption has comfortable reading time (about 2-4 seconds
  per beat), ending with a clean 2-3 s end card.
- Do not call ElevenLabs and do not add placeholder or broken audio tags.`;

  const editSoundEleven = `Keep SFX in the gaps between voice lines, at volume 1 or lower (the files are already levelled under the voice).
If the edit changes a spoken line, the timing or the length, make new sound with \`${ELEVEN_CMD}\`
(\`tts "<line>" <out.mp3> --prev .. --next ..\`, \`music "<prompt>" <seconds> <out.mp3>\`,
\`sfx "<sound>" <out.mp3>\`; it prints the length in seconds). Regenerate only what changed, and
keep the voice on top of the mix.`;

  const editSoundSilent = `Audio generation is disabled for this run (silent/captioned mode). Do not call ElevenLabs; keep
the film self-contained with clear on-screen titles and captions (or keep any existing audio files
already in film/public untouched).`;

  const vars = {
    TITLE,
    SKILL,
    LOGO: logoBase,
    ACCENT,
    AUDIENCE,
    BRAND_NOTE: brandNote,
    VISUAL_DIRECTION_SECTION: visualDirectionSection,
    FORMAT_SECTION: formatSection,
    CAPTIONS_SECTION: captionsSection,
    SOUND_SECTION: AUDIO_MODE === "elevenlabs" ? soundEleven : soundSilent,
    EDIT_SOUND_SECTION: AUDIO_MODE === "elevenlabs" ? editSoundEleven : editSoundSilent,
    POST_RENDER_CHECK: AUDIO_MODE === "elevenlabs"
      ? "one audio check (`volumedetect` on a speech window and a gap) and a few frame grabs at the transitions."
      : "a few frame grabs at the transitions.",
    NOTES_SOUND: AUDIO_MODE === "elevenlabs"
      ? "the voice-over script (line, start time, length), the music prompt, the SFX list,"
      : "the on-screen caption script,",
  };

  let text = fs.readFileSync(process.argv[1], "utf8");
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, v ?? "");
  }
  fs.writeFileSync(process.argv[2], text);
' "$TEMPLATE" "$C/$BRIEF_FILE"

cd "$C"
# Provider-specific auth/binary preflight so problems fail in seconds, not mid-render.
run_director_agent() {
  case "$PROVIDER_ID" in
    claude)
      [ -z "${ANTHROPIC_API_KEY:-}" ] && unset ANTHROPIC_API_KEY
      local args=(-p "$TASK" --dangerously-skip-permissions --add-dir "$SKILL" --output-format stream-json --verbose)
      [ -n "$RESOLVED_MODEL" ] && args+=(--model "$RESOLVED_MODEL")
      timeout "${CREATIVE_TIMEOUT:-40m}" claude "${args[@]}" 2>&1
      ;;
    codex)
      local args=(exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --add-dir "$SKILL" --json)
      [ -n "$RESOLVED_MODEL" ] && args+=(-m "$RESOLVED_MODEL")
      args+=("$TASK")
      timeout "${CREATIVE_TIMEOUT:-40m}" codex "${args[@]}" 2>&1
      ;;
    gemini-cli)
      local args=(-p "$TASK" --approval-mode yolo --skip-trust --include-directories "$SKILL" --output-format stream-json)
      [ -n "$RESOLVED_MODEL" ] && args+=(-m "$RESOLVED_MODEL")
      timeout "${CREATIVE_TIMEOUT:-40m}" gemini "${args[@]}" 2>&1
      ;;
    opencode)
      local args=(run --format json --auto --archived)
      [ -n "$RESOLVED_MODEL" ] && args+=(--model "$RESOLVED_MODEL")
      args+=("$TASK")
      timeout "${CREATIVE_TIMEOUT:-40m}" opencode "${args[@]}" 2>&1
      ;;
    *)
      local args=("$SCRIPTS_DIR/agent.$SCRIPT_EXT" --provider "$PROVIDER_ID" --skill "$SKILL" --task "$TASK")
      [ -n "$RESOLVED_MODEL" ] && args+=(--model "$RESOLVED_MODEL")
      timeout "${CREATIVE_TIMEOUT:-40m}" node "${args[@]}" 2>&1
      ;;
  esac
}

if [ "$PROVIDER_ID" = "claude" ]; then
  [ -z "${ANTHROPIC_API_KEY:-}" ] && unset ANTHROPIC_API_KEY
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    T="$CLAUDE_CODE_OAUTH_TOKEN"
    echo "CLAUDE_CODE_OAUTH_TOKEN: ${#T} chars, prefix ok: $([[ "$T" == sk-ant-oat* ]] && echo yes || echo NO), whitespace: $([[ "$T" =~ [[:space:]] ]] && echo YES || echo no)"
  fi
  if ! timeout 120 claude -p "Reply with the word ok." --model haiku > "$RUNNER_TEMP/auth.txt" 2>&1; then
    echo "::error::Claude sign-in failed. Re-create the token with 'claude setup-token' and set ONLY the sk-ant-oat01-... line as CLAUDE_CODE_OAUTH_TOKEN."
    tail -5 "$RUNNER_TEMP/auth.txt"; exit 1
  fi
  echo "  ✓ Preflight   Claude Code signed in"
elif [ "$PROVIDER_KIND" = "cli" ]; then
  BIN_NAME=$([ "$PROVIDER_ID" = "gemini-cli" ] && echo "gemini" || echo "$PROVIDER_ID")
  command -v "$BIN_NAME" >/dev/null 2>&1 || { echo "::error::$PROVIDER_LABEL ($BIN_NAME) is not installed."; exit 1; }
  echo "  ✓ Preflight   $PROVIDER_LABEL ready"
else
  echo "  ✓ Preflight   $PROVIDER_LABEL ready (built-in multimodal agent)"
fi

echo ""
echo "  ▶ Directing & rendering film…"
# Stream live progress to the terminal while recording timed JSONL to agent.log for CI.
run_director_agent | node "$SCRIPTS_DIR/stream-progress.$SCRIPT_EXT" "$RUNNER_TEMP/agent.log" || {
  echo "creative agent failed (exit $?); last lines:"; tail -c 3000 "$RUNNER_TEMP/agent.log"; exit 1; }

# The contract CI relies on.
test -s out/video.mp4 || { echo "no out/video.mp4"; exit 1; }
test -s NOTES.md || { echo "no NOTES.md"; exit 1; }
if [ -n "${EDIT_REQUEST:-}" ]; then test -s CHANGES.md || { echo "no CHANGES.md"; exit 1; }; else rm -f CHANGES.md; fi
jq -e '.scripts.render' film/package.json >/dev/null || { echo "film/package.json has no render script"; exit 1; }
test -f film/package-lock.json || { echo "film/package-lock.json missing"; exit 1; }
run_ffprobe() {
  if command -v ffprobe >/dev/null 2>&1; then
    ffprobe "$@"
  elif [ -x "$HERE/node_modules/.bin/remotion" ]; then
    "$HERE/node_modules/.bin/remotion" ffprobe "$@"
  elif [ -x "$HERE/../node_modules/.bin/remotion" ]; then
    "$HERE/../node_modules/.bin/remotion" ffprobe "$@"
  else
    npx --no-install remotion ffprobe "$@"
  fi
}

# Sound checks (only when running in elevenlabs audio mode).
if [ "$AUDIO_MODE" = "elevenlabs" ]; then
  run_ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 out/video.mp4 \
    | grep -q audio || { echo "out/video.mp4 has no audio track"; exit 1; }
  USAGE=$(curl -sf "$ELEVEN_ENDPOINT/usage" || echo '{}')
  if [ -z "${EDIT_REQUEST:-}" ]; then
    jq -e '.used.ttsCalls > 0 and .used.musicCalls > 0' <<<"$USAGE" >/dev/null \
      || { echo "no ElevenLabs voice-over or music was made"; exit 1; }
  fi
  echo "  ✓ Audio       $(jq -r '"\(.used.ttsCalls) voice lines (\(.used.ttsChars) chars) · \(.used.musicCalls) music (\(.used.musicSeconds) s) · \(.used.sfxCalls) SFX"' <<<"$USAGE")"
fi
rm -rf input                        # rebuilt from the captures on every run; never committed
# Export .srt and .vtt subtitle tracks if the agent wrote captions.json.
SUB_MSG=$(node "$SCRIPTS_DIR/subtitles.$SCRIPT_EXT" "$(pwd)/.." 2>&1 || true)
if [ -f out/captions.srt ]; then
  echo "  ✓ Subtitles   ${SUB_MSG#Exported }"
fi

# 12 stills (one every ~3 s) as the contact sheet. Optional: needs a full system ffmpeg
# (Remotion's bundled build lacks these filters); the preview MP4 is the real output.
DUR=$(run_ffprobe -v error -show_entries format=duration -of csv=p=0 out/video.mp4)
if command -v ffmpeg >/dev/null; then
  if ffmpeg -v error -y -i out/video.mp4 -vf "fps=12/$DUR,scale=640:-1,tile=4x3:padding=6:color=0x111111" \
    -frames:v 1 sheet.png; then
    echo "  ✓ Sheet       Contact sheet → sheet.png"
  else
    echo "::warning::contact sheet failed"
  fi
else
  echo "::warning::no system ffmpeg: no contact sheet"
fi
if [ -n "${CI:-}" ]; then
  python3 - "$RUNNER_TEMP/agent.log" <<'EOF' || true
import json, sys, re
turns = ms = 0; cost = 0.0; first = last = None
start = {}; spent = {}; count = {}
def kind(name, inp):
    if name != "Bash": return "files/read/edit" if name in ("Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "LS") else name
    c = inp.get("command", "")
    if re.search(r"npm run render|remotion render", c): return "full render"
    if "remotion still" in c or "npm run still" in c: return "stills"
    if "eleven.ts" in c or "eleven.js" in c: return "elevenlabs"
    if re.search(r"npm (ci|install|i )", c): return "npm install"
    if "ffmpeg" in c or "ffprobe" in c: return "ffmpeg checks"
    return "other shell"
for l in open(sys.argv[1]):
    ts, _, js = l.partition("\t")
    try: t = float(ts); d = json.loads(js)
    except Exception: continue
    first = first or t; last = t
    content = (d.get("message") or {}).get("content") or []
    if d.get("type") == "assistant":
        for c in content:
            if isinstance(c, dict) and c.get("type") == "tool_use":
                start[c["id"]] = (t, kind(c.get("name"), c.get("input") or {}))
    elif d.get("type") == "user":
        for c in content:
            if isinstance(c, dict) and c.get("type") == "tool_result" and c.get("tool_use_id") in start:
                t0, k = start.pop(c["tool_use_id"]); spent[k] = spent.get(k, 0) + t - t0; count[k] = count.get(k, 0) + 1
    elif d.get("type") == "result":
        turns += d.get("num_turns", 0); ms += d.get("duration_ms", 0); cost = d.get("total_cost_usd", cost)
print(f"agent: {turns} turns, {round(ms/60000,1)} min, ~${cost:.2f} API-equivalent")
if first:
    total = last - first; tools = sum(spent.values())
    print(f"agent time split ({round(total/60,1)} min wall):")
    for k, s in sorted(spent.items(), key=lambda x: -x[1]):
        print(f"  {k:16} {round(s/60,1):5} min  x{count[k]}")
    print(f"  {'model (thinking)':16} {round((total-tools)/60,1):5} min")
EOF
fi
echo ""
echo "🎉 Done! ($(printf '%.1f' "$DUR") s)"
echo "   Video:      $(pwd)/out/video.mp4"
[ -f "$(pwd)/STRATEGY.md" ] && echo "   Strategy:   $(pwd)/STRATEGY.md"
[ -f "$(pwd)/sheet.png" ] && echo "   Contact:    $(pwd)/sheet.png"
[ -f "$(pwd)/out/captions.srt" ] && echo "   Subtitles:  $(pwd)/out/captions.srt"
