import express from 'express';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { join } from 'node:path';
import { createPool, runMigrations } from '../../../Common/db/index.ts';
import { PostgresPersonRepository } from '../../Adapters/Postgres/postgres-person-repository.ts';
import { PostgresSessionRepository } from '../../Adapters/Postgres/postgres-session-repository.ts';
import { ScryptPasswordHasher } from '../../Adapters/Crypto/scrypt-password-hasher.ts';
import { JoseTokenIssuer } from '../../Adapters/Jwt/jose-token-issuer.ts';
import { loadOrCreateJwtSecret } from '../../Adapters/Config/jwt-secret.ts';
import { AuthService } from '../Services/auth-service.ts';
import { AuthController } from '../Controllers/auth-controller.ts';
import { errorMapping } from '../Filters/error-mapping.ts';

/**
 * Composition root: connect the shared Postgres pool, run the persons-store
 * migrations, then build the adapters, inject them into the auth service, wire the
 * controller, and mount it under /api. Returns the pool so the server can close it
 * on shutdown and ping it for /healthz. Call it after createApp() and before
 * startServer().
 *
 * The authentication backend (issue #149): registration, login, cookie-based JWT
 * sessions and rotating refresh tokens. The JWT signing secret self-provisions to a
 * persistent volume (JWT_SECRET_FILE) so redeploys keep existing sessions valid.
 */
export async function register(app: Express): Promise<Pool> {
  const pool = await createPool('auth');
  await runMigrations(pool, {
    schema: 'auth',
    dir: join(import.meta.dirname, '../../Adapters/Postgres/migrations'),
  });

  // Adapters (infrastructure implementations of the domain/ports interfaces).
  const personRepository = new PostgresPersonRepository(pool);
  const sessionRepository = new PostgresSessionRepository(pool);
  const passwordHasher = new ScryptPasswordHasher();
  const tokenIssuer = new JoseTokenIssuer(loadOrCreateJwtSecret(), '7d');

  // Application service + controller.
  const authService = new AuthService(personRepository, sessionRepository, passwordHasher, tokenIssuer);
  const authController = new AuthController(authService, tokenIssuer);

  app.use(express.json({ limit: '256kb' }));
  app.use('/api', authController.router);
  // Map domain errors to HTTP; unknown errors fall through to server-kit's handler.
  app.use(errorMapping());

  return pool;
}
