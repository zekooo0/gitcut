# GitCut

An open-source pipeline that turns **pull requests**, **live URLs**, or **any GitHub repository README**
into short, AI-directed Remotion videos.

- **PR & Live-UI Mode:** Playwright captures your real running web app (including authenticated
  staging or preview deployments) at DPR 2 and measures exact DOM element boxes, then Claude Code +
  `video-shotcraft` directs and renders a brand-new Remotion film with human review/edit loops.
- **Repo / README Reel Mode (`gitcut repo`):** Point GitCut at any public/private GitHub repo or
  local folder (CLI tools, libraries, frameworks—no live URL or browser required) to generate a
  snappy 15–30 s vertical, square, or widescreen showcase reel straight from `README.md`, repo
  metadata, and real README screenshots.

There is **no rigid template and no fixed house style**: every film is designed from scratch around
your product's real UI or repo, logo, and accent colour, with optional ElevenLabs voice-over, music,
and SFX—or crisp silent/captioned output.

## Ways to use it

1. **Drop-in GitHub Actions (zero server to host)** — Copy [examples/gitcut.yml](examples/gitcut.yml) and `.gitcut.json` into any repo; comment `/gitcut` (or `/video`) on PRs.
2. **Repo / README Reel Mode (zero browser needed)** — Run `gitcut repo owner/repo` locally or trigger [repo-reel.yml](.github/workflows/repo-reel.yml) from GitHub Actions to generate a 15–30 s README/social reel for any repo.
3. **Local CLI (no GitHub PR required)** — Point `gitcut create` at `http://localhost:3000` or any staging/preview URL with a short text brief.
4. **Central multi-repo GitHub App (optional)** — Host [app/](app/) (Probot) to route `/gitcut` commands across an entire GitHub organization into one pipeline repo.

---

## Quickstart 1: Add to any GitHub repo (no server needed)

Run one command inside your app repo (no clone needed!):

```bash
npx gitcut-cli setup-github --auto-preview --name "My App"
```

That creates `.gitcut.json` and `.github/workflows/gitcut.yml` (copied from [examples/gitcut.yml](examples/gitcut.yml)) and prints the direct link to your repo's GitHub Secrets page.

Then:
1. Add repository secrets (**Settings → Secrets and variables → Actions**):
   - `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`)
   - Optional: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (for the planner), `ELEVENLABS_API_KEY` (omit for silent/captioned mode), `DEMO_EMAIL` / `DEMO_PASSWORD` (if your app requires login), `YOUTUBE_*` / `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` / `LINEAR_API_KEY` / `CLICKUP_TOKEN`.
2. Commit & push those two files, then comment `/gitcut` (or `/gitcut plan url=https://your-preview.vercel.app`) on any PR!

Each film is stored on an orphan branch `video/<slug>` in your repo (never touching `main`), and
preview/final MP4s are published as GitHub Releases using `GITHUB_TOKEN`.

---

## Quickstart 2: Local CLI & Guided Wizard (works without GitHub PRs)

Requirements: Node 24+, Claude Code CLI signed in, `jq`, optional `ffmpeg` (contact sheets & SFX).

```bash
# Install globally (optional — gives you the short `gitcut` command):
npm install -g gitcut-cli

# Or run directly with npx (no install needed!):
npx gitcut-cli doctor       # Check your setup in 2 seconds
npx gitcut-cli              # Launch the interactive wizard (no flags to remember!)

# Or run directly via flags:
# 1. Generate a 15-30s repository reel from ANY GitHub repo or local folder (no browser needed!)
npx gitcut-cli repo zekooo0/gitcut --format vertical --captions

# 2. Generate a live-UI feature film (install Playwright browser once: npx playwright install chromium)
npx gitcut-cli create \
  --url http://localhost:3000 \
  --title "Dark mode toggle" \
  --brief "Users can now switch between light and dark themes from Settings." \
  --routes /settings

# 3. Iterate in plain English, then render the final MP4:
npx gitcut-cli edit .gitcut/dark-mode-toggle "shorter intro, punchier end card"
npx gitcut-cli render .gitcut/dark-mode-toggle --out ./dark-mode.mp4
```

- Set `ELEVENLABS_API_KEY` to enable automatic voice-over, music, and SFX (the CLI starts and stops the isolated local proxy automatically). Omit it or pass `--audio silent` for silent/captioned videos.
- Set `CAPTURE_STORAGE_STATE=.auth/session.json` (Playwright storage state) or your site's login env vars for authenticated apps.
- Individual steps are also available: `plan`, `capture`, `film`, `edit`, `render`, `subtitles`, `notify`, `discover`.

---

## PR commands (write access required; `/video` also works as an alias)

| Command | Result |
|---|---|
| `/gitcut` or `/gitcut plan` | Plan + capture + generate a new film; posts preview MP4 on the PR (~10-20 min). |
| `/gitcut plan routes=/settings/profile` | Same, targeting specific app routes (skips the AI route pass). |
| `/gitcut plan url=https://pr-42.vercel.app` | Capture a specific preview/staging URL instead of the site's default `baseUrl`. |
| `/gitcut plan format=square` (or `vertical`, `1:1`, `9:16`) | Set the canvas aspect ratio (`landscape` 1920×1080 default, `square` 1080×1080, `vertical` 1080×1920). |
| `/gitcut plan captions=on` | Burn synced subtitles into the video (and export `.srt` + `.vtt` release assets). |
| `/gitcut plan site=<name>` | Use a named site config (`template/sites/<name>.json`). |
| `/gitcut plan clickup=<taskId>` | Link a specific ClickUp task (otherwise parsed from PR body/branch). |
| `/gitcut recapture` | Re-capture from the branch's `capture.json` (after manual edits), then generate a new film. |
| `/gitcut edit <your request>` | Modify the current film in plain words (supports multiple lines) and keep the rest (~5-10 min). |
| `/gitcut approve` | Render the final MP4 from the branch's Remotion project and post links. No AI. |
| `/gitcut help` | Show the command list. |

Adding the `gitcut` label to a PR also starts a plan.

---

## Configure your app (`.gitcut.json`)

Place `.gitcut.json` at the root of your repository (or add `template/sites/<name>.json` + map it in [template/sites/repos.json](template/sites/repos.json)):

```json
{
  "baseUrl": "https://staging.example.com",
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "login": {
    "url": "/login",
    "fields": {
      "input[name=email]": "DEMO_EMAIL",
      "input[name=password]": "DEMO_PASSWORD"
    },
    "submit": "button[type=submit]",
    "loggedOut": "/login"
  },
  "panel": "auto",
  "hide": ["#hubspot-messages-iframe-container", "iframe[title*=chat i]"],
  "brand": {
    "logo": "public/logo.svg",
    "accent": "#2563EB"
  },
  "product": {
    "name": "Acme App",
    "description": "A short product walkthrough for Acme App.",
    "audience": "users",
    "website": "https://example.com"
  },
  "safetyRules": [
    "Never submit destructive changes on shared staging data: avoid clicking Save, Delete, or Send."
  ]
}
```

- Omit `login` for public web apps that do not require authentication.
- Set `"autoPreview": true` (or omit `baseUrl` entirely on PRs with Vercel / Netlify / Cloudflare Pages / GitHub Deployments) to automatically detect and film the PR's own preview deployment URL.
- Set `"format": "square"` or `"vertical"` and `"captions": true` in `.gitcut.json` to configure defaults per repo.
- `login.fields` maps CSS selectors to **environment variable names**, never literal passwords.
- `brand.logo` can point to a logo file inside your repo (copied automatically during planning).

---

## Subtitles, formats & integrations

- **Aspect ratio presets**: `landscape` (`16:9`, 1920×1080), `square` (`1:1`, 1080×1080 for LinkedIn/X), and `vertical` (`9:16`, 1080×1920 for Shorts/Reels/TikTok).
- **Subtitles & burned-in captions**: Every film exports `.srt` and `.vtt` tracks automatically (attached to the GitHub Release alongside the MP4), and `captions=on` / `--captions` burns synced captions into the video.
- **Audio modes**: With `ELEVENLABS_API_KEY` set, an isolated local proxy ([template/scripts/eleven.ts](template/scripts/eleven.ts)) reads the key on `stdin` only with per-run caps (3000 TTS chars, 3 music tracks / 150 s, 25 SFX; override voice with `ELEVEN_VOICE_ID`). Without it, runs automatically in **silent/captioned mode**.
- **YouTube upload (after `/gitcut approve`)**: Set `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN` (via `node template/scripts/youtube-auth.ts`), plus optional `YOUTUBE_PRIVACY` (`private` default, `unlisted`, or `public`).
- **Slack, Discord, Linear & custom webhooks**: Set any of `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `LINEAR_API_KEY` (auto-detects `ENG-123` / Linear URLs from the PR), or `NOTIFY_WEBHOOK_URL` (+ optional `NOTIFY_WEBHOOK_SECRET` for HMAC-SHA256 `X-GitCut-Signature` signing).
- **ClickUp notifications**: Set `CLICKUP_TOKEN` to enrich planning with linked ClickUp tasks and post the final MP4 (+ YouTube link) back on approval.
- **Self-hosted Docker runner**: See [runner/README.md](runner/README.md) for running ephemeral, sandboxed containers on your own server (~3x faster renders).

## Multi-repo GitHub App (optional)

For organizations that want one central `gitcut` repo to serve many repositories via a
single GitHub App install:

1. Create a GitHub App with repository permissions: Actions (`Read and write`), Contents (`Read-only`), Issues (`Read and write`), Pull requests (`Read and write`), Metadata (`Read-only`), subscribed to `Issue comment` and `Pull request` events.
2. Install it on your `gitcut` repo and on each source repo.
3. Configure `APP_ID`, `APP_PRIVATE_KEY`, and your pipeline secrets on the `gitcut` repo (uses [.github/workflows/gitcut.yml](.github/workflows/gitcut.yml)).
4. Copy [app/.env.example](app/.env.example) to `app/.env` and host [app/](app/):
   ```bash
   docker build -t gitcut-app app
   docker run -d --restart unless-stopped -p 127.0.0.1:3000:3000 --env-file app/.env \
     -v "$PWD/app/key.pem:/app/key.pem:ro" gitcut-app
   ```

## Repository layout

```
.github/workflows/
  pipeline.yml                 Reusable PR workflow (zero-server adoption for any repo)
  repo-reel.yml                Repository / README showcase reel workflow (no browser needed)
  gitcut.yml                   Central workflow_dispatch pipeline (for Probot App)
  ci.yml                       Tests + TypeScript check on pushes/PRs
examples/
  gitcut.yml                   Drop-in caller workflow for target repos
template/
  scripts/cli.ts               Unified local CLI (init, create, repo, plan, capture, film, edit, render)
  scripts/repo-brief.ts        GitHub repo or local folder -> repo.json + BRIEF.md + README assets
  scripts/brief.ts             PR or standalone brief -> capture.json + BRIEF.md
  scripts/discover.ts          Live DOM discovery for routes
  scripts/capture.ts           Playwright DPR-2 capture + DOM bounding boxes
  scripts/creative.sh          Creative agent driver -> Remotion film + preview MP4
  scripts/eleven.ts            Isolated ElevenLabs local proxy + CLI
  scripts/parse-comment.ts     PR command parser for reusable workflow
  scripts/comment.ts           PR comment formatter
  scripts/subtitles.ts         Exports captions.json -> .srt and .vtt
  scripts/notify.ts            Optional Slack, Discord, Linear, and webhook notifier
  scripts/clickup-comment.ts   Optional ClickUp notifier
  scripts/youtube-upload.ts    Optional YouTube uploader
  scripts/lib/site.ts          Zero-dependency site config loader
  sites/example.json           Example site config
creative/                      Agent briefs (BRIEF.md, EDIT.md), SHOTS.md, starter/, shotcraft/
app/                           Optional Probot GitHub App for multi-repo routing
runner/                        Optional ephemeral Docker self-hosted runner
```

## Costs, safety & licensing

- **CI & AI usage**: ~10-20 CI minutes per video (faster on a [self-hosted runner](runner/README.md)) plus one Claude agent run (and optional ElevenLabs usage capped per run).
- **License**: Licensed under the [Apache License 2.0](LICENSE). The vendored `creative/shotcraft` skill is also Apache-2.0.
- **Remotion license**: Films are rendered with [Remotion](https://www.remotion.dev/license), which is free for individuals and organizations with up to 3 people; larger companies require a Remotion Company License.
- **ElevenLabs**: Commercial use of generated voice/music/SFX requires an eligible ElevenLabs plan.
