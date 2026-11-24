# Contributing to GitCut

Thanks for your interest in contributing to **GitCut**! Contributions of all kinds—bug fixes, new integrations, shot cards, docs improvements, and tests—are welcome.

## Development setup

Requirements: **Node.js 24+** and **Git** (optional: `claude`, `ffmpeg`, `jq` for end-to-end film runs).

```bash
git clone https://github.com/zekooo0/gitcut.git
cd gitcut

# Install dependencies
(cd app && npm ci)
(cd template && npm ci)
```

## Running checks locally

Before opening a pull request, make sure every check passes:

```bash
# 1. GitHub App tests
(cd app && npm test)

# 2. Pipeline typecheck, build, and unit tests
(cd template && npm run typecheck && npm run build && npm test)
```

To test the published npm CLI experience locally without publishing:

```bash
npm pack
# Inspect or install the generated gitcut-cli-*.tgz in a temp directory
```

## Architecture & where to add things

| Area | Location | Notes |
|---|---|---|
| **CLI & interactive wizard** | `template/scripts/cli.ts`, `template/scripts/lib/doctor.ts` | Keep zero-dependency Node builtins where possible. |
| **Repo / README Reel mode** | `template/scripts/repo-brief.ts`, `template/scripts/lib/repo-context.ts`, `creative/REPO.md` | Pure parsing helpers live in `lib/` with `*.test.ts`. |
| **PR & Live-UI planning** | `template/scripts/brief.ts`, `template/scripts/discover.ts`, `template/scripts/lib/preview-url.ts` | Add new preview deployment detectors to `preview-url.ts`. |
| **Playwright capture** | `template/scripts/capture.ts`, `template/scripts/lib/session.ts`, `template/docs/authoring.md` | Capture rules in `authoring.md` are sent directly to the planner LLM. |
| **Canvas formats & subtitles** | `template/scripts/lib/format.ts`, `template/scripts/lib/subtitles.ts`, `template/scripts/subtitles.ts` | Pure logic + unit tests. |
| **Audio proxy** | `template/scripts/eleven.ts` | API keys must stay isolated from the creative agent (passed via stdin only, never env/argv). |
| **Notifiers & uploaders** | `template/scripts/notify.ts`, `template/scripts/youtube-upload.ts`, `template/scripts/clickup-comment.ts` | Failures must never block the released MP4. |
| **GitHub Actions workflows** | `.github/workflows/pipeline.yml`, `repo-reel.yml`, `gitcut.yml`, `examples/gitcut.yml` | Never interpolate untrusted PR/comment inputs directly into `run:` shell lines; always pass via `env:`. |
| **GitHub App (Probot)** | `app/index.js`, `app/commands.js` | Keep `app/commands.js` and `template/scripts/parse-comment.ts` in sync. |

## Good first contributions

- **Additional audio backends**: OpenAI TTS, Edge TTS, or custom background music files alongside ElevenLabs.
- **More preview-hosting detectors**: Additional deployment platforms in `template/scripts/lib/preview-url.ts`.
- **More notifiers & trackers**: Jira, Notion, GitHub Discussions, or S3/R2 asset uploads in `template/scripts/notify.ts`.
- **Output formats**: Inline GIF/WebM preview clips for PR comments and changelogs.
- **Auth hooks**: Bearer token / cookie header injection or custom Playwright auth scripts in `template/scripts/lib/session.ts`.

## Pull request guidelines

1. Keep PRs focused on one change and include unit tests (`*.test.ts` or `*.test.js`) for new logic.
2. Never commit secrets, `.env` files, Playwright storage state files (`.auth/`), or rendered videos.
3. Preserve third-party licenses and attribution (such as `creative/shotcraft/LICENSE`).
4. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
