# Brief: a repository showcase reel for "{{TITLE}}"

You are the director. There is **no template, no reference film and no house style**: invent
this film from scratch for this repository. Make it snappy, high-impact, and worthy of the top
of a GitHub README or a social developer feed (target **15 to 30 seconds**).

Use the video-shotcraft skill at {{SKILL}} (read-only). Mode: **autonomous free creation**
(自主自由创作). Read its SKILL.md, then references/pipeline.md fully, and follow it end to end
WITHOUT stopping for confirmation. Skip the workbench steps and the Ink Press template.

## Shot cards: pick 3 to 5 from ./input/shots.md
Pick **3 to 5 shot cards** that fit THIS repository, ONLY from the list in ./input/shots.md, and
build the film around them. Read only those cards and their demos; do not browse the rest of
the library. Adapt each card faithfully to motion graphics, terminal/code blocks, architecture
diagrams, and any real screenshots in `./input/assets/`. In NOTES.md, name the cards you picked
and say in one line why each fits.

## Inputs (all in ./input, read-only)
- repo.json: repository metadata (name, fullName, description, url, language, stars, license, topics).
- facts.md: summary, repo stats, top-level structure, and README excerpt.
- readme.md: the full `README.md` of the repository.
- assets/: real images/screenshots referenced in the README (if any exist — feature them if useful!).
- brand/: {{BRAND_NOTE}}

{{FORMAT_SECTION}}

{{SOUND_SECTION}}

{{CAPTIONS_SECTION}}

## Visual storytelling for a repository reel
- **Hook fast (first 2 seconds):** open with the repository name/problem and why a developer should
  care — bold typography, strong contrast, crisp pacing.
- **Show real developer proof:** animate a real install command (`npm i ...`, `pip install ...`,
  `git clone ...`), a real code snippet from `readme.md`, a clean feature breakdown, or real
  screenshots from `./input/assets/`.
- **Clean end card (2–3 s):** display the repository path (`owner/repo` / GitHub URL), license or
  tagline, and a crisp call to action.

## Checking your work (time counts: a full render takes minutes on CI)
- Check with stills, not renders: `npx remotion still src/index.ts Film --frame=<n> <out.png>`
  at every scene boundary and at the key moments. Fix and re-check stills as often as needed.
- Then render the full film ONCE (`npm run render`). After it: {{POST_RENDER_CHECK}}
- Render a second time only for a defect anyone would see at once (black or empty frames,
  overlapping text, broken layout, missing voice). Never a third time.

## Everything else is yours
The story, pacing, transitions, camera, background, typography, code styling, and captions.
The logo (if present) and the accent colour {{ACCENT}} are there if you want them.

## The one rule
Every claim, command, code snippet, metric, and image must come strictly from `readme.md`,
`repo.json`, `facts.md`, or `./input/assets/`. Never invent fake commands, fake benchmarks,
or fake UI screenshots.

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
