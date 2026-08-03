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

# Provision app roles/schemas/credentials idempotently on EVERY boot — not just
# on fresh-volume init (which runs init/10-roles.sh). A background waiter blocks
# until the real post-init server accepts TCP connections, then runs the shared
# provisioner, so a newly added app (e.g. auth) gets its role/schema/credential
# on the next `up` with no data-volume wipe. Re-running is a safe no-op. See
# db/provision-roles.sh.
provision_on_boot() {
  db_user="${POSTGRES_USER:-postgres}"
  db_name="${POSTGRES_DB:-postgres}"
  # Only the real server (post-init) listens on TCP; the transient init server
  # binds the unix socket only, so this waits past the init phase.
  until pg_isready -h 127.0.0.1 -U "$db_user" -d "$db_name" >/dev/null 2>&1; do
    sleep 1
  done
  PGPASSWORD="$POSTGRES_PASSWORD" \
  PSQL_BASE="psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U $db_user -d $db_name" \
    sh /provision-roles.sh \
    || echo "[db-provision] boot provisioning failed (will retry on next boot)"
}
provision_on_boot &

exec docker-entrypoint.sh postgres
