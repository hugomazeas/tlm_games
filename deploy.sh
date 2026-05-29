#!/usr/bin/env sh
# Production deploy script. Run on the server as: sh deploy.sh
#
# `set -e` is essential here. The CI job used to inline these steps as a
# multi-line `script:` block, where only the final line actually executed —
# so `git pull` and `make migrate` were silently skipped while the job still
# reported green. Running this single script fixes that, and `set -e` makes a
# failure in any step (e.g. a failed `git pull`) abort with a non-zero exit
# instead of being masked by a later successful command.
set -eu

# Operate from the repo root regardless of the caller's working directory.
cd "$(dirname "$0")"

git pull --ff-only

# --force skips the interactive "run this in production?" prompt (CI has no
# TTY); -T disables pseudo-TTY allocation for the exec.
docker compose exec -T app php artisan migrate --force

make cache
make down
make up
