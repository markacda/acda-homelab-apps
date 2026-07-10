import { join } from 'node:path';
import { createApp, startServer } from '../Common/server-kit/app.ts';
import { register } from './Application/Registrations/register.ts';

// Thin composition root: create the app on the shared bootstrap, wire the DDD
// layers via register(), then start listening. Everything else lives under
// Domain/ Application/ Adapters/ Ports/ Models/ Web/ — see ARCHITECTURE.md.
const app = createApp('dynamic-vs-fixed');
register(app);
startServer(app, {
  name: 'dynamic-vs-fixed',
  port: Number(process.env.PORT) || 6003,
  staticDir: join(process.cwd(), 'Web', 'public'),
});
