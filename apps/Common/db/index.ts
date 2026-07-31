// Shared PostgreSQL kit for the homelab apps. Imported by relative `.ts` path
// (like the other apps/Common/* packages) and compiled into each consumer's
// dist/. See pool.ts for the connection-sourcing precedence.
export { createPool, closePool } from './pool.ts';
export { runMigrations } from './migrator.ts';
export type { MigrationClient, MigrationPool, MigrationOptions } from './migrator.ts';
export { pingDb } from './health.ts';
