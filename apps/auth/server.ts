import { join } from 'node:path';
import { createApp, startServer } from '../Common/server-kit/app.ts';
import { closePool, pingDb } from '../Common/db/index.ts';
import { register } from './Application/Registrations/register.ts';

// Thin composition root: create the app on the shared bootstrap, wire the DDD
// layers via register() (which connects Postgres + runs migrations), then start
// listening. Everything else lives under Domain/ Application/ Adapters/ Ports/
// Models/ Web/ — see ARCHITECTURE.md. The auth app owns the persons store
// (email = username, hashed password, roles). The authentication backend
// (registration/login/tokens) and its HTTP endpoints land in issue #149.
const app = createApp('auth');
const pool = await register(app);
startServer(app, {
  name: 'auth',
  port: Number(process.env.PORT) || 6007,
  staticDir: join(process.cwd(), 'Web', 'public'),
  onShutdown: () => closePool(pool),
  healthCheck: () => pingDb(pool),
});
