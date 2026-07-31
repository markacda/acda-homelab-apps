#!/bin/sh
# Runs once, on first initialisation of the data directory (sourced by the
# postgres entrypoint from /docker-entrypoint-initdb.d). Provisions one role +
# one schema per data-owning app, each with its own generated password, and
# writes each app's full connection string to the shared `db-secrets` volume as
# `<role>.url`. Apps read that file via DATABASE_URL_FILE — no password is ever
# passed through env, an image, compose, or git.
#
# Idempotent by construction: it only runs on a fresh data dir, so the roles
# never pre-exist here. If the secrets volume was preserved while the data dir
# was recreated, the previous password is reused from the existing `<role>.url`
# so the credentials stay in sync.
set -e

SECRETS_DIR=/secrets
mkdir -p "$SECRETS_DIR"

gen_pw() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32; }

# provision <role> <schema>
provision() {
  role="$1"
  schema="$2"
  url_file="$SECRETS_DIR/$role.url"

  if [ -f "$url_file" ]; then
    # Reuse the password already handed out (data dir was recreated, secrets kept).
    pw="$(sed -n 's#^postgresql://[^:]*:\([^@]*\)@.*#\1#p' "$url_file")"
  else
    pw="$(gen_pw)"
  fi

  # psql interpolates :"x" as a quoted identifier and :'x' as a quoted literal,
  # so role/schema/password are injected safely.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v role="$role" -v schema="$schema" -v pw="$pw" <<'EOSQL'
CREATE ROLE :"role" LOGIN PASSWORD :'pw';
CREATE SCHEMA :"schema" AUTHORIZATION :"role";
GRANT ALL ON SCHEMA :"schema" TO :"role";
ALTER ROLE :"role" SET search_path = :"schema";
EOSQL

  printf 'postgresql://%s:%s@db:5432/%s\n' "$role" "$pw" "$POSTGRES_DB" > "$url_file"
  # World-readable so each app's non-root `node` user can read it across the
  # shared volume; the volume is only mounted into our own app containers.
  chmod 644 "$url_file"
  echo "[db-init] provisioned role/schema '$role' -> $url_file"
}

provision notification notification
provision recipe_book recipe_book
