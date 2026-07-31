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
- `db/entrypoint.sh` bootstraps the superuser password; `db/init/10-roles.sh`
  provisions the roles/schemas and writes `/secrets/<role>.url` on first init.

> **Volumes are a matched pair.** `pg-data` (the database) and `db-secrets` (the
> generated credentials) must be backed up and wiped **together**. Deleting only
> one leaves the roles in `pg-data` out of sync with the passwords in
> `db-secrets` and apps will fail to authenticate.

## First deployment (migrating existing JSON data)

The apps carry a **one-time, idempotent importer**: on startup, after migrations,
if a table is empty and the old JSON data is still on the data volume, they copy
it into Postgres. So the migration is driven entirely by starting the updated
apps — no manual data-copy scripts.

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
5. **Clean up** the migrated JSON (optional, once verified):
   - notification: its data volume is no longer used — you may remove the
     `notification-data` volume mount and the `notification-data` volume.
   - recipe-book: **keep** `recipe-book-data` — it still holds image bytes, the
     generated PDF/TeX output, and the Tectonic cache.
   - Optionally drop the importer code (`*/Adapters/Postgres/*import*.ts` and its
     call in `register.ts`) in a follow-up PR. Leaving it in is harmless: the
     empty-table guard makes it a no-op.
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

1. Add a `provision <role> <schema>` line to `db/init/10-roles.sh`.
2. Add the service to `docker-compose.yml` with `depends_on: { db: { condition:
service_healthy } }`, `DATABASE_URL_FILE=/secrets/<role>.url`, and a
   `db-secrets:/secrets:ro` mount.
3. In the app: `createPool()` → `runMigrations()` → build a Postgres adapter for
   its port; pass `onShutdown: () => closePool(pool)` and
   `healthCheck: () => pingDb(pool)` to `startServer`.
4. Stage `apps/Common/db` in the app's Dockerfile builder and copy its
   `Adapters/Postgres/migrations` into `dist/`.
