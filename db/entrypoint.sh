#!/bin/sh
# Zero-touch superuser bootstrap for the shared Postgres container.
#
# The official postgres image needs POSTGRES_PASSWORD *before* its init scripts
# run, which is a chicken-and-egg for a no-manual-secrets setup. So this wrapper
# runs first (as root): it generates a random superuser password once and
# persists it to the shared `db-secrets` volume, exports it, then hands off to
# the stock entrypoint. The superuser is only ever used by the init scripts over
# the local socket; the apps connect with their own per-app roles (see
# init/10-roles.sh). Invoked via `sh` from compose so no +x bit is needed.
set -e

SECRETS_DIR=/secrets
mkdir -p "$SECRETS_DIR"
# World-writable so the init scripts (which run as the unprivileged postgres
# user) can drop the per-app credential files here.
chmod 777 "$SECRETS_DIR"

PW_FILE="$SECRETS_DIR/postgres.pw"
if [ ! -f "$PW_FILE" ]; then
  # Portable random password (busybox/coreutils both provide these; avoids an
  # openssl dependency that the alpine image doesn't ship).
  head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32 > "$PW_FILE"
  chmod 600 "$PW_FILE"
fi

POSTGRES_PASSWORD="$(cat "$PW_FILE")"
export POSTGRES_PASSWORD

exec docker-entrypoint.sh postgres
