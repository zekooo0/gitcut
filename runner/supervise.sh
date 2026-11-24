#!/usr/bin/env bash
# Runs the GitCut self-hosted runner: one fresh container per job (ephemeral), forever.
#
#   REPO=zekooo0/gitcut runner/supervise.sh  (run it under systemd or tmux on the server)
#
# Env:
#   REPO           owner/repo of the GitCut repo          (required)
#   TOKEN_FILE     file with a fine-grained GitHub token  (default /etc/gitcut-runner/token)
#                  Repository access: only REPO. Permission: Administration = Read and write.
#                  It stays on the host: the container only gets a 1-hour registration token,
#                  which it drops before the job starts.
#   MEMORY         hard RAM limit, no swap                 (default 3500m)
#   CPU_SHARES     CPU priority vs other work (1024 = equal) (default 256: other builds on the
#                  same host get ~80% of the CPU; when the host is idle the job may use all of it)
#   CPUS           optional hard CPU cap                    (default: none)
#   The container also gets --oom-score-adj 500: if the host runs out of RAM, the kernel kills
#   the video job first, never the other services running next to it.
#   IMAGE          image tag                              (default gitcut-runner)
set -euo pipefail
REPO="${REPO:?set REPO=owner/repo (your GitCut repository)}"
TOKEN_FILE="${TOKEN_FILE:-/etc/gitcut-runner/token}"
IMAGE="${IMAGE:-gitcut-runner}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -r "$TOKEN_FILE" ] || { echo "missing $TOKEN_FILE"; exit 1; }
echo "serving $REPO"

while true; do
  # rebuild before each job (seconds when nothing changed): a `git pull` of this repo reaches the
  # next job, including new package versions baked into the image
  docker build -q -t "$IMAGE" -f "$HERE/Dockerfile" "$HERE/.." >/dev/null || { echo "$(date -Is) image build failed; retry in 60 s"; sleep 60; continue; }
  REG=$(curl -fsS -X POST -H "Authorization: Bearer $(cat "$TOKEN_FILE")" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/runners/registration-token" | jq -r .token) || REG=""
  if [ -z "$REG" ] || [ "$REG" = null ]; then echo "$(date -Is) no registration token; retry in 60 s"; sleep 60; continue; fi
  NAME="fv-$(hostname -s)-$(date +%s)"
  echo "$(date -Is) waiting for a job as $NAME"
  # --ephemeral: the runner takes ONE job, then the container exits and is removed (--rm).
  docker run --rm --name "$NAME" ${CPUS:+--cpus "$CPUS"} --cpu-shares "${CPU_SHARES:-256}" \
    --memory "${MEMORY:-3500m}" --memory-swap "${MEMORY:-3500m}" --oom-score-adj 500 --shm-size 1g \
    --security-opt no-new-privileges -e REG_TOKEN="$REG" "$IMAGE" bash -c '
      ./config.sh --unattended --ephemeral --disableupdate --url "https://github.com/'"$REPO"'" \
        --token "$REG_TOKEN" --name "'"$NAME"'" --labels gitcut >/dev/null
      unset REG_TOKEN; exec ./run.sh' || echo "$(date -Is) container exited with $?"
  sleep 2
done
