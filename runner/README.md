# Self-hosted runner

The `gitcut` workflow can run on your own server instead of GitHub's 2-core runners.
GitHub still schedules the job, shows the logs, and hosts the release assets; your server only
does the capture and render work (~3x faster renders on a 4-vCPU box).

## How it works

- `runner/Dockerfile`: GitHub's runner image plus every tool the job uses (Node 24, `gh`, `ffmpeg`,
  Chromium, the Claude Code CLI, and the npm cache). No `sudo` inside: the job runs an AI agent
  with full permissions inside the container.
- `runner/supervise.sh`: a host loop. For each job it requests a 1-hour registration token from
  GitHub, starts a fresh container that runs exactly **one** job (`--ephemeral --rm`), and deletes
  it afterward. Nothing a job writes reaches the next job, and the admin token stays on the host.
- The workflow selects the runner via the repo variable `VIDEO_RUNNER`. Unset = GitHub-hosted
  `ubuntu-latest`.

## Setup

1. **Server**: Docker installed, ~15 GB free disk for the image. Tested on 4 vCPU / 8 GB RAM
   alongside other CI workloads (~8 min per film, ~2.3 GB peak RAM). Defaults protect sibling
   services: low CPU shares (`256`), a `3500m` RAM cap with no swap, and `--oom-score-adj 500`.
   Avoid running it on a production application host.
2. **Fine-grained GitHub token**: Resource owner = your org/user, Repository access = only your
   `gitcut` repo, Repository permission = `Administration: Read and write` (nothing else).
3. **Start the supervisor** (as a user in the `docker` group, separate from the user owning the
   GitHub App's `.env`/`.pem`):
   ```bash
   git clone https://github.com/zekooo0/gitcut.git && cd gitcut
   sudo mkdir -p /etc/gitcut-runner
   sudo install -m 600 -o "$USER" /dev/stdin /etc/gitcut-runner/token         # paste token, Ctrl-D
   REPO=zekooo0/gitcut ./runner/supervise.sh                                 # first build takes ~7 min
   ```
   Keep it running under `systemd` or `tmux`. Running `git pull` rebuilds the image before the
   next job automatically.
4. **Repo variable** (Settings → Secrets and variables → Actions → Variables):
   `VIDEO_RUNNER` = `["self-hosted","gitcut"]`

Verify: Settings → Actions → Runners shows `fv-<host>-<time>` as Idle with label `gitcut`.

## Switch back to GitHub-hosted runners

Delete the `VIDEO_RUNNER` variable — no code changes needed.

## Notes

- One job at a time per supervisor. Run a second supervisor if you want concurrent jobs (size CPU/RAM accordingly).
- Stopping the supervisor manually can leave one runner listed as "Offline" in GitHub Settings; remove it there.
- Jobs wait in the queue while no runner is online.
