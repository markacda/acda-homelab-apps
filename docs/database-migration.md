# Centralized database — first deployment & migration

The homelab apps that own data (**notification** and **recipe-book**) now store
their structured data in a single shared **PostgreSQL** container (service `db`)
instead of JSON files on per-app volumes. Each app gets its own role and schema;
image bytes and generated PDFs for recipe-book stay on its data volume.

Credentials are **self-provisioning**: on first boot the `db` container
generates a superuser password and a per-app password, and writes each app's
connection string to a shared `db-secrets` volume. Apps read their connection
string from that volume via `DATABASE_URL_FILE`. There is **nothing to put in a
`.env` and no manual password step** — `docker compose up` just works.

## Architecture

- One `db` service (`postgres:17-alpine`), internal-only (no published host port),
  reachable by other containers as host `db`.
- Database `homelab`; one schema + one login role per app:
  - notification → schema/role `notification`
  - recipe-book → schema/role `recipe_book`
- Each role's `search_path` defaults to its own schema, so app SQL is unqualified.
- Migrations run at app startup (idempotent, fail-loud) from `Adapters/Postgres/migrations/*.sql`.
- `db/entrypoint.sh` bootstraps the superuser password, then provisions the app
  roles/schemas/credentials **idempotently on every boot** (a background waiter
  runs `db/provision-roles.sh` once the server is ready). `db/init/10-roles.sh`
  runs the same shared provisioner on fresh-volume init. So provisioning is a
  self-healing boot task, not a one-shot: adding an app takes effect on the next
  `docker compose up -d --build db` with no data-volume wipe.

> **Schema/data changes go through migrations, never the init sh scripts.** The
> `db/*.sh` scripts only bootstrap roles/schemas/credentials (which a SQL
> migration can't do — an app needs its role to connect, and a migration can't
> write the secret file). Everything an app owns — tables, columns, indexes,
> seed data — belongs in a numbered `Adapters/Postgres/migrations/NNN_*.sql`
> applied at startup. Editing `db/init/10-roles.sh` does nothing on an
> already-initialised database; the every-boot provisioner is what picks up a
> newly added role there.

> **Volumes are a matched pair.** `pg-data` (the database) and `db-secrets` (the
> generated credentials) must be backed up and wiped **together**. Deleting only
> one leaves the roles in `pg-data` out of sync with the passwords in
> `db-secrets` and apps will fail to authenticate.

## First deployment (migrating existing JSON data)

> **Historical.** The one-time JSON→DB importer described below shipped only in
> the initial rollout (PR #133, commit `927247f`) and has since been **removed**
> now that the cutover is complete. Fresh deployments start with empty tables.
> To replay this migration against an old JSON data volume, check out that commit
> first, run the steps, then update to `main`.

That importer was **idempotent**: on startup, after migrations, if a table was
empty and the old JSON data was still on the data volume, the app copied it into
Postgres — so the migration was driven entirely by starting the updated apps,
with no manual data-copy scripts.

1. **Bring up the database** (provisions roles/schemas + secrets on first boot):
   ```sh
   docker compose up -d --build db
   ```
2. **Stop the data-owning apps** so nothing writes JSON while cutting over:
   ```sh
   docker compose stop notification recipe-book
   ```
   _(Starting completely fresh with no existing JSON data? Skip to step 3.)_
3. **Rebuild & start the apps.** On startup each runs its DB migrations, then the
   importer copies any legacy JSON into Postgres (logged as `[import] … imported N row(s)`):
   ```sh
   docker compose up -d --build notification recipe-book
   ```
4. **Verify** the data appears in each app's UI (the notification feed at
   `/notificaties`, recipes/books at `/receptenboek`). Check the logs for the
   import summary lines.
5. **Clean up** the migrated JSON (done, once verified):
   - notification: its data volume is no longer used — the `notification-data`
     volume + mount and the app's `DATA_DIR` have been removed.
   - recipe-book: **keep** `recipe-book-data` — it still holds image bytes, the
     generated PDF/TeX output, and the Tectonic cache.
   - The importer code (`*/Adapters/Postgres/*import*.ts`) and the legacy
     JSON-file store have been removed now that every deployment has cut over.
6. **Bring the whole stack back:**
   ```sh
   docker compose up -d --build
   ```

## Adding a schema change later

Add a new numbered file to the app's `Adapters/Postgres/migrations/` (e.g.
`002_add_column.sql`). It is applied once, in filename order, on the next
startup and recorded in `<schema>.schema_migrations`. Never edit an
already-applied migration — add a new one.

## Adding a new data-owning app

1. Add a `provision <role> <schema>` line to `db/provision-roles.sh` (the single
   source of truth for both fresh init and the every-boot pass). Then
   `docker compose up -d --build db` provisions the role/schema/credential on the
   running database — no fresh volume, no manual SQL.
2. Add the service to `docker-compose.yml` with `depends_on: { db: { condition:
service_healthy } }`, `DATABASE_URL_FILE=/secrets/<role>.url`, and a
   `db-secrets:/secrets:ro` mount. (Run `up -d --build db` before the app the
   first time so the role exists; otherwise the app retries via its restart policy.)
3. In the app: `createPool()` → `runMigrations()` → build a Postgres adapter for
   its port; pass `onShutdown: () => closePool(pool)` and
   `healthCheck: () => pingDb(pool)` to `startServer`. The app's schema (tables,
   etc.) lives in its own numbered migrations, **not** in the db sh scripts.
4. Stage `apps/Common/db` in the app's Dockerfile builder and copy its
   `Adapters/Postgres/migrations` into `dist/`.
