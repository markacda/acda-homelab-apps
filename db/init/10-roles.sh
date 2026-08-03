#!/bin/sh
# Fresh-volume path: runs once, on first initialisation of the data directory
# (sourced by the postgres entrypoint from /docker-entrypoint-initdb.d), while
# the bootstrap server is reachable over the local socket. It delegates to the
# shared, idempotent provisioner (db/provision-roles.sh) so there is a single
# source of truth for the app roles/schemas — the same script also runs on every
# boot from db/entrypoint.sh, which is what picks up newly added apps on an
# already-initialised database.
set -e

PSQL_BASE="psql -v ON_ERROR_STOP=1 --username $POSTGRES_USER --dbname $POSTGRES_DB"
export PSQL_BASE
sh /provision-roles.sh
