# Edit request for the film "{{TITLE}}"

A finished film is in ./film (a Remotion project). A person watched its preview and asked for a
change. Their request, in their own words, is in ./input/request.md.

Do exactly what the request asks, and keep everything else as it is: the same story, shots,
style, music and timing, except where the request says otherwise. If a part of the request is
unclear or cannot be done with the captures, do the closest reasonable thing and say so in
CHANGES.md.

You may use the video-shotcraft skill at {{SKILL}} (read-only) if the change needs a new shot or
effect: only the cards listed in ./input/shots.md. The inputs are the same as for the first film:
./input (facts.md, pr.md, captures/, capture.json, positions.json, layout.json, brand/). The
film's own assets are already in film/public: reuse them.

{{EDIT_SOUND_SECTION}}

## The one rule
Use only these real screenshots as product UI. Never invent UI, numbers or features that are
not in facts.md, pr.md or visible in the captures.

## Output contract (CI depends on it)
- Change the project in ./film in place. It stays self-contained (every asset in film/public,
  never reading ./input at render time), with package.json + package-lock.json and the
  `"render"` script that writes `../out/video.mp4`.
- Check the change with stills (`npx remotion still src/index.ts <id> --frame=<n> <out.png>`),
  then render the full film ONCE: ./out/video.mp4 must exist when you finish.
- ./CHANGES.md: what you changed, in 2-6 short bullets, and anything from the request you could
  not do (and why). Overwrite it; it describes this edit only.
- Update ./NOTES.md where the edit changed the storyboard.
- Update ./captions.json if the edit changed any spoken lines, captions, or timing.
