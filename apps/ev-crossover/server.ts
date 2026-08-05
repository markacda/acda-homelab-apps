import { join } from 'node:path';
import { createApp, startServer } from '../Common/server-kit/app.ts';
import { createRoleGuards, ROLE_USER } from '../Common/auth/index.ts';

// A static calculator page — no API routes and no server-side domain (the whole
// crossover computation runs in the browser; see Web/client/crossover.ts). See
// ARCHITECTURE.md for why the server DDD layers are omitted here.
const app = createApp('ev-crossover');

// User-role gate (issue #174): the app has no API, so it needs only the page guard —
// a logged-out browser is 302-redirected to the auth login. /healthz stays public.
const { requirePage } = createRoleGuards({
  role: ROLE_USER,
  appHome: '/laden-of-tanken/',
  forbiddenMessage: 'Your account is signed in but is not allowed to view this app.',
});
app.use(requirePage);

startServer(app, {
  name: 'ev-crossover',
  port: Number(process.env.PORT) || 6002,
  staticDir: join(process.cwd(), 'Web', 'public'),
});
