# Brief: a repository showcase reel for "{{TITLE}}"

You are the creative director. Make a snappy, unmistakable **15 to 30 second** showcase film
tailored to THIS repository's exact personality — never recycle a generic dark-blue SaaS look.

Use the video-shotcraft skill at {{SKILL}} (read-only). Mode: **autonomous free creation**
(自主自由创作). Read its SKILL.md, then references/pipeline.md fully, and follow it end to end
WITHOUT stopping for confirmation. Skip the workbench steps and the Ink Press template.

## Step 1 (REQUIRED before writing any code): Repo analysis & ./STRATEGY.md
Read `./input/repo.json`, `./input/facts.md`, `./input/readme.md`, and inspect `./input/assets/` (if any).
Before creating any Remotion code, write `./STRATEGY.md` with:
1. **Developer Hook & Audience:** Who is this repo for and what makes a developer stop scrolling in the first 2 seconds?
2. **Narrative Strategy (pick ONE clear angle):**
   - e.g. *One-Line Magic* (show the jaw-dropping single command + outcome), *Problem → Tool* (pain point snapped away), *Architecture / Speed Proof*, or *Visual Demo Reel* (led by real README screenshots).
3. **Visual System:** Exact background, surface, ink, accent colors, font pairing, and motion feel — obeying the visual direction below.
4. **Shot Plan:** Which 3–5 shot cards from `./input/shots.md` fit this exact strategy and why.

Then build `./film/` strictly from `./STRATEGY.md`.

{{VISUAL_DIRECTION_SECTION}}

## Shot cards: pick 3 to 5 from ./input/shots.md
Pick **3 to 5 shot cards** from `./input/shots.md` (prioritizing the style-matched cards listed
above) and build the film around them. Read only those cards and their demos; do not browse the
rest of the library. Adapt each card faithfully to motion graphics, terminal/code blocks,
diagrams, and any real screenshots in `./input/assets/`.

## Inputs (all in ./input, read-only)
- repo.json: repository metadata (name, fullName, description, url, language, stars, license, topics).
- facts.md: summary, repo stats, top-level structure, and README excerpt.
- readme.md: the full `README.md` of the repository.
- assets/: real images/screenshots referenced in the README (if any exist — feature them if useful!).
- brand/: {{BRAND_NOTE}}

{{FORMAT_SECTION}}

{{SOUND_SECTION}}

{{CAPTIONS_SECTION}}

## Checking your work (time counts: a full render takes minutes on CI)
- Check with stills, not renders: `npx remotion still src/index.ts Film --frame=<n> <out.png>`
  at every scene boundary and at the key moments. Fix and re-check stills as often as needed.
- Then render the full film ONCE (`npm run render`). After it: {{POST_RENDER_CHECK}}
- Render a second time only for a defect anyone would see at once (black or empty frames,
  overlapping text, broken layout, missing voice). Never a third time.

## The one rule
Every claim, command, code snippet, metric, and image must come strictly from `readme.md`,
`repo.json`, `facts.md`, or `./input/assets/`. Never invent fake commands, fake benchmarks,
or fake UI screenshots.

## Output contract (CI depends on it)
- ./STRATEGY.md: written FIRST (developer hook, narrative angle, visual system, shot plan).
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
