import express from 'express';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { join } from 'node:path';
import { createPool, runMigrations } from '../../../Common/db/index.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

/**
 * Composition root: connect the shared Postgres pool, run the persons-store
 * migrations, then install the base middleware and return the pool (so the
 * server can close it on shutdown and ping it for /healthz). Call it after
 * createApp() and before startServer().
 *
 * This scaffold (issue #148) stands up the persons store — the Person aggregate,
 * its repository port and Postgres adapter live under Domain/ and Adapters/ and
 * are covered by unit tests. The authentication backend (registration, login,
 * tokens) mounts its controllers here in issue #149; until then no persons
 * endpoint is exposed.
 */
export async function register(app: Express): Promise<Pool> {
  const pool = createPool('auth');
  await runMigrations(pool, {
    schema: 'auth',
    dir: join(import.meta.dirname, '../../Adapters/Postgres/migrations'),
  });

  app.use(express.json({ limit: '256kb' }));
  // Map domain errors to HTTP; unknown errors fall through to server-kit's handler.
  app.use(errorMapping());

  return pool;
}
