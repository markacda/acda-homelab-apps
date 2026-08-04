// Auth app — login & create-account page. Served under the /auth/ proxy prefix
// (stripped before it reaches the app), so all API URLs stay RELATIVE
// (`fetch('api/login')`, never `/api/login`). The session cookies are httpOnly and
// set server-side on login, so this client never stores or reads a token itself.

interface PersonView {
  id: string;
  email: string;
  roles: string[];
}

/** Server-side minimum (auth-service MIN_PASSWORD_LENGTH); mirrored for early feedback. */
const MIN_PASSWORD_LENGTH = 8;

/** Throwing element getter (mirrors the recipe-book client helper). */
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/**
 * POST JSON and return the parsed body, throwing the server's `{ error }` message on
 * a non-2xx response. Cookies are same-origin, so the browser sends and stores the
 * session cookies automatically — no token handling here.
 */
async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

const statusEl = $('status');

/** Toggle the shared status banner below the forms. */
function setStatus(msg: string, kind: '' | 'error' = ''): void {
  statusEl.hidden = !msg;
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`.trim();
}

/**
 * Restrict the post-auth redirect to a same-origin root-relative path so a crafted
 * `?redirect=` can't bounce the user off to another site (`//evil.com`, `/\evil.com`)
 * or a `javascript:` URL. Anything else falls back to the dashboard root.
 */
function safeRedirect(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
  return '/';
}

const redirectTarget = safeRedirect(new URLSearchParams(location.search).get('redirect'));

/**
 * Reveal the Administrator-only "Gebruikers" link if an already-signed-in visitor
 * holds that role. Best-effort: a missing session (401) just leaves it hidden.
 */
async function revealAdminLink(): Promise<void> {
  try {
    const res = await fetch('api/me');
    if (!res.ok) return;
    const me = (await res.json()) as PersonView;
    if (me.roles.includes('Administrator')) $('admin-link').hidden = false;
  } catch (err) {
    // A non-ok response (e.g. 401 when signed out) is expected and handled above;
    // reaching here means the request itself failed (network/parse), so warn.
    console.warn('Could not check admin status:', err);
  }
}
void revealAdminLink();

/** Client mirror of the server's credential rules (the server stays the source of truth). */
function validate(email: string, password: string): string | null {
  if (!email.includes('@')) return 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

// ---- mode toggle ----------------------------------------------------------

const loginForm = $<HTMLFormElement>('login-form');
const registerForm = $<HTMLFormElement>('register-form');
const formTitle = $('form-title');
const formSubtitle = $('form-subtitle');
const toRegister = $('to-register');
const toLogin = $('to-login');

/** Swap between the sign-in and create-account forms. */
function showMode(mode: 'login' | 'register'): void {
  const isLogin = mode === 'login';
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  toRegister.hidden = !isLogin;
  toLogin.hidden = isLogin;
  formTitle.textContent = isLogin ? 'Sign in' : 'Create account';
  formSubtitle.textContent = isLogin ? 'Sign in to your homelab account.' : 'Create a homelab account to continue.';
  setStatus('');
}

$('show-register').addEventListener('click', (e) => {
  e.preventDefault();
  showMode('register');
});
$('show-login').addEventListener('click', (e) => {
  e.preventDefault();
  showMode('login');
});

// ---- submit handlers ------------------------------------------------------

/** Run an in-flight submit with the button disabled, surfacing any error inline. */
async function withButton(button: HTMLButtonElement, run: () => Promise<void>): Promise<void> {
  button.disabled = true;
  try {
    await run();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $<HTMLInputElement>('login-email').value.trim();
  const password = $<HTMLInputElement>('login-password').value;
  const problem = validate(email, password);
  if (problem) {
    setStatus(problem, 'error');
    return;
  }
  void withButton($<HTMLButtonElement>('login-submit'), async () => {
    await api<PersonView>('api/login', { email, password });
    location.assign(redirectTarget);
  });
});

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $<HTMLInputElement>('register-email').value.trim();
  const password = $<HTMLInputElement>('register-password').value;
  const confirm = $<HTMLInputElement>('register-confirm').value;
  const problem = validate(email, password);
  if (problem) {
    setStatus(problem, 'error');
    return;
  }
  if (password !== confirm) {
    setStatus('Passwords do not match.', 'error');
    return;
  }
  void withButton($<HTMLButtonElement>('register-submit'), async () => {
    // Registration returns 201 but sets no session cookie, so immediately sign in
    // with the same credentials to establish the session, then redirect.
    await api<PersonView>('api/register', { email, password });
    await api<PersonView>('api/login', { email, password });
    location.assign(redirectTarget);
  });
});
