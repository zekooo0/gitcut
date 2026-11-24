# Brief: a feature video for "{{TITLE}}"

You are the creative director. Every film must feel **custom-made for THIS exact product** —
its audience, its real visual identity, and its sharpest story angle. Never recycle a generic
"dark SaaS template" look.

Use the video-shotcraft skill at {{SKILL}} (read-only). Mode: **autonomous free creation**
(自主自由创作). Read its SKILL.md, then references/pipeline.md fully, and follow it end to end
WITHOUT stopping for confirmation. Skip the workbench steps and the Ink Press template.

## Step 1 (REQUIRED before writing any code): Website analysis & ./STRATEGY.md
Read `./input/facts.md`, `./input/pr.md`, `./input/captures/*.png`, and `./input/theme.json` (if present).
Before creating any Remotion code, write `./STRATEGY.md` with:
1. **Product & Audience Diagnosis:** What does this product actually do, who uses it, and what is the single sharpest value proposition visible on the live website?
2. **Story Strategy (pick ONE clear narrative angle — not a generic bullet list):**
   - e.g. *Problem → Relief*, *Instant Demo-First Proof*, *Before → After Transformation*, *3-Step Workflow Speedrun*, or *Editorial Thesis + Live UI Evidence*.
3. **Visual System:** Exact background, surface, ink, and accent hex colors, font pairing, and motion personality — obeying the visual direction below.
4. **Shot Plan:** Which 3–5 shot cards from `./input/shots.md` serve this specific strategy and why.

Then build `./film/` strictly from `./STRATEGY.md`.

{{VISUAL_DIRECTION_SECTION}}

## Shot cards: pick 3 to 5 from ./input/shots.md
Pick **3 to 5 shot cards** from `./input/shots.md` (prioritizing the style-matched cards listed
above) and build the film around them. Read only those cards and their demos; do not browse the
rest of the library. Implement each card faithfully from its card text and demo code (adapted to
the captures), not as a generic pan or zoom.

## Inputs (all in ./input, read-only)
- facts.md: the product/feature facts and what changed for {{AUDIENCE}}.
- pr.md: pull request or product brief context.
- theme.json (when present): real computed CSS colors, light/dark mode, fonts, and meta description extracted from the live website.
- captures/*.png: real screenshots of the live app, at DPR 2. `window` shots are the whole
  browser window; `panel` shots are the full page content stitched into one tall image.
- capture.json: how each capture was taken (the URL, the clicks, the kind).
- positions.json: pixel boxes [x, y, w, h] of named elements inside each capture: crop, zoom
  and highlight precisely with them. A capture may list `missing`: elements the robot could not
  find. They have no box; do not highlight them and do not guess where they are.
- layout.json: where the panel sits inside the window.
- brand/: {{BRAND_NOTE}}

{{FORMAT_SECTION}}

{{SOUND_SECTION}}

{{CAPTIONS_SECTION}}

## Checking your work (time counts: a full render takes minutes on CI)
- Check with stills, not renders: `npx remotion still src/index.ts Film --frame=<n> <out.png>`
  at every scene boundary and at the key moments. Fix and re-check stills as often as needed.
- Then render the full film ONCE (`npm run render`). After it: {{POST_RENDER_CHECK}}
- Render a second time only for a defect anyone would see at once (black or empty frames,
  broken layout, missing text/voice, a broken scene). Never a third time. Skip the skill's extra
  review rounds and independent-review step: a person reviews the preview and can ask for edits.

## The one rule
Use only these real screenshots as product UI. Never invent UI, numbers or features that are
not in facts.md, pr.md, theme.json, or visible in the captures.

## Output contract (CI depends on it)
- ./STRATEGY.md: written FIRST (product diagnosis, narrative angle, visual system, shot plan).
- ./film already holds an EMPTY Remotion project with its packages installed (remotion 4.0.541,
  React 19, @remotion/google-fonts, @remotion/motion-blur): setup only, no look. Build the film
  in it. The composition is `Film` in src/Root.tsx; set its size, fps and length there. Add a
  package only if you need it (`npm install <pkg>`, keep package-lock.json in step).
- Copy every asset the film uses into film/public; it must not read ./input at render time.
  No build output. Keep the `"render"` script: it renders the final film to `../out/video.mp4`
  (run as `npm ci && npm run render` from ./film on a clean machine).
- Render it once yourself: ./out/video.mp4 must exist when you finish.
- ./NOTES.md: the visual direction in 2 lines, the shot cards picked (and why), {{NOTES_SOUND}}
  the storyboard (scene, time, shot card, caption) and the known flaws. Short.
- ./captions.json: a JSON array of timed subtitle cues matching the spoken lines or on-screen
  captions (`[{"start": 0.5, "end": 3.2, "text": "..."}]`, seconds). CI exports `.srt` and `.vtt`
  files from it automatically.
