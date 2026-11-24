# Self-hosted runner for the GitCut workflow: GitHub's runner plus every tool the job
# uses, so the job never needs sudo. Built and started by runner/supervise.sh.
FROM ghcr.io/actions/actions-runner:latest

USER root
RUN mkdir -p /opt/fv && chown runner:runner /opt/fv
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg git jq python3 ffmpeg unzip \
 && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 # Chromium's system libraries (Playwright capture + Remotion render), installed once here
 && npx -y playwright@1.65 install-deps chromium \
 && rm -rf /var/lib/apt/lists/* \
 # the job runs an AI agent with every permission: no sudo inside the container
 && rm -f /etc/sudoers.d/* \
 && (deluser runner sudo 2>/dev/null || true)

# Everything a job would download, baked in (each job starts from a fresh container, so nothing
# is cached between jobs and nothing a job writes reaches the next one):
# - Chromium for the capture, read-only for the runner user
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
# the same headless shell renders the films (creative/starter/remotion.config.ts), so Remotion
# downloads no Chrome per film. Update the path when the Playwright version changes.
ENV REMOTION_CHROME=/opt/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell
COPY --chown=runner:runner template/package.json template/package-lock.json /opt/fv/template/
COPY --chown=runner:runner creative/starter/package.json creative/starter/package-lock.json /opt/fv/starter/
RUN cd /opt/fv/template && npm ci --no-audit --no-fund --ignore-scripts >/dev/null \
 && npx playwright install chromium && chmod -R a+rX,go-w /opt/ms-playwright \
 # - the Claude Code CLI
 && npm install -g --no-audit --no-fund @anthropic-ai/claude-code >/dev/null \
 && rm -rf /opt/fv/template/node_modules /root/.npm

USER runner
# - the npm cache of both lock files, so `npm ci` in the job installs offline
RUN cd /opt/fv/template && npm ci --no-audit --no-fund --ignore-scripts >/dev/null \
 && cd /opt/fv/starter && npm ci --no-audit --no-fund --ignore-scripts >/dev/null \
 && rm -rf /opt/fv/template/node_modules /opt/fv/starter/node_modules
