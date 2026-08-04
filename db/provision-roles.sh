#!/bin/sh
# Idempotent, atomic provisioning of one login role + schema per data-owning app.
# This is the single source of truth for the app roles/schemas; it is run in two
# places, both safe to repeat:
#   * db/init/10-roles.sh — once on fresh-volume init, over the unix socket.
#   * db/entrypoint.sh     — on EVERY boot, over TCP once the server is ready, so
#                            newly added apps get provisioned on the next `up`
#                            with no data-volume wipe.
#
# Every step is guarded, so re-running changes nothing:
#   * the role is created only if missing (pg_roles guard executed via \gexec);
#   * schema/grants/search_path use IF NOT EXISTS / are naturally idempotent;
#   * the password is reused from an existing /secrets/<role>.url so `pg-data`
#     and `db-secrets` stay in sync. A missing secret file is (re)generated and
#     the role password reset to match — self-healing a wiped-secrets/kept-data
#     state. No password is ever passed through env, an image, compose, or git.
#
# The caller supplies $PSQL_BASE (how to connect) and the standard POSTGRES_*
# env. Adding a new data-owning app = add one `provision <role> <schema>` line.
set -e

: "${PSQL_BASE:?PSQL_BASE must be set by the caller}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"

SECRETS_DIR=/secrets
mkdir -p "$SECRETS_DIR"

gen_pw() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32; }

# provision <role> <schema>
provision() {
  role="$1"
  schema="$2"
  url_file="$SECRETS_DIR/$role.url"

  if [ -f "$url_file" ]; then
    # Reuse the password already handed out; the role's password is assumed to be
    # in sync, so we only ensure the role/schema exist.
    pw="$(sed -n 's#^postgresql://[^:]*:\([^@]*\)@.*#\1#p' "$url_file")"
    reset_pw=0
  else
    pw="$(gen_pw)"
    reset_pw=1
  fi

  # Create the role only if it does not already exist. The SELECT emits the
  # CREATE statement (built with format() so %I/%L quote safely) only when the
  # role is absent; \gexec then runs it — a no-op when the role is present.
  # psql interpolates :"x" as a quoted identifier and :'x' as a quoted literal.
  $PSQL_BASE -v role="$role" -v schema="$schema" -v pw="$pw" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role')
\gexec
CREATE SCHEMA IF NOT EXISTS :"schema" AUTHORIZATION :"role";
GRANT ALL ON SCHEMA :"schema" TO :"role";
ALTER ROLE :"role" SET search_path = :"schema";
EOSQL

  if [ "$reset_pw" = 1 ]; then
    # The secret file was missing: force the role password to the freshly issued
    # one (covers "role existed but the secret was wiped"), then write the file.
    # Fed via stdin, not `psql -c`: psql interpolates :"x"/:'x' variables only in
    # script input, never in a -c command string (there they reach the server
    # verbatim and error with `syntax error at or near ":"`).
    $PSQL_BASE -v role="$role" -v pw="$pw" <<'EOSQL'
ALTER ROLE :"role" PASSWORD :'pw';
EOSQL
    printf 'postgresql://%s:%s@db:5432/%s\n' "$role" "$pw" "$POSTGRES_DB" > "$url_file"
    # World-readable so each app's non-root `node` user can read it across the
    # shared volume; the volume is only mounted into our own app containers.
    chmod 644 "$url_file"
    echo "[db-provision] issued credential for role '$role' -> $url_file"
  fi

  echo "[db-provision] ensured role/schema '$role'"
}

provision notification notification
provision recipe_book recipe_book
provision auth auth
