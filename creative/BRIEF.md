# Brief: a feature video for "{{TITLE}}"

You are the director. There is **no template, no reference film and no house style**: invent
this film from scratch for this feature. Do not imitate any earlier film; no two films should
look alike.

Use the video-shotcraft skill at {{SKILL}} (read-only). Mode: **autonomous free creation**
(自主自由创作). Read its SKILL.md, then references/pipeline.md fully, and follow it end to end
WITHOUT stopping for confirmation. Skip the workbench steps and the Ink Press template.

## Shot cards: pick 3 to 5 from ./input/shots.md
Pick **3 to 5 shot cards** that fit THIS feature, ONLY from the list in ./input/shots.md, and
build the film around them. Read only those cards and their demos; do not browse the rest of
the library. Implement each card faithfully
from its card text and demo code (adapted to the captures), not as a generic pan or zoom. In
NOTES.md, name the cards you picked and say in one line why each fits.

## Inputs (all in ./input, read-only)
- facts.md: the feature and what changed for {{AUDIENCE}}. It is the story source, together
  with pr.md (the pull request). Nothing else is.
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

## Everything else is yours
The story, structure, length, format, pacing, transitions, camera, background, typography,
title and captions. The logo and the accent colour {{ACCENT}} are there if you want them.

## The one rule
Use only these real screenshots as product UI. Never invent UI, numbers or features that are
not in facts.md, pr.md or visible in the captures.

## Output contract (CI depends on it)
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
