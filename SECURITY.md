# Security Policy

## Security design notes

GitCut runs an autonomous AI coding agent (`claude --dangerously-skip-permissions`) to generate and render Remotion projects. Because PR titles/bodies and README files can contain untrusted text, GitCut enforces several boundaries:

- **Write-access gating:** PR comment commands (`/gitcut`, `/video`) are only accepted from collaborators with `write`, `maintain`, or `admin` repository permissions.
- **Secret isolation:** The creative agent step clears `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD`, and `CLICKUP_TOKEN`. When ElevenLabs is enabled, `ELEVENLABS_API_KEY` is passed via `stdin` to a localhost-only proxy (`127.0.0.1:8790`) with per-run spend caps—the agent never receives the key.
- **Safe shell handling:** Free-form user text (such as `/gitcut edit` requests) is passed via environment variables and files, never interpolated into shell commands or `sed` expressions.
- **Ephemeral runner isolation:** The optional self-hosted Docker runner (`runner/`) runs one disposable container per job with no `sudo`, `--security-opt no-new-privileges`, and hard memory limits.
- **Least-privilege demo accounts:** Always use a dedicated, read-only demo account for staging captures—never an admin account.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report vulnerabilities privately via GitHub's **Security → Advisories → Report a vulnerability** tab on https://github.com/zekooo0/gitcut/security/advisories. Include steps to reproduce and the affected file(s) or workflow(s). We aim to acknowledge reports within 72 hours.
