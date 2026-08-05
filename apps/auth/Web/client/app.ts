// Auth app — login & create-account page. Served under the /auth/ proxy prefix
// (stripped before it reaches the app), so all API URLs stay RELATIVE
// (`fetch('api/login')`, never `/api/login`). The session cookies are httpOnly and
// set server-side on login, so this client never stores or reads a token itself.
//
// The shared auth + DOM helpers come from @homelab/auth-client and @homelab/web-kit
// (issue #177), compiled in via tsconfig.client.json. This page installs NO fetch
// redirect guard: a 401 here means "signed out / bad credentials", surfaced inline.

import { apiJson, fetchCurrentUser, hasRole, logout, safeRedirect, ROLE_ADMINISTRATOR, type PersonView } from '../../../Common/auth-client/index.ts';
import { $, setStatus as webSetStatus } from '../../../Common/web-kit/index.ts';

/** Server-side minimum (auth-service MIN_PASSWORD_LENGTH); mirrored for early feedback. */
const MIN_PASSWORD_LENGTH = 8;

const statusEl = $('status');

/** Toggle the shared status banner below the forms. */
function setStatus(msg: string, kind: '' | 'error' = ''): void {
  statusEl.hidden = !msg;
  webSetStatus(statusEl, msg, kind);
}

const redirectTarget = safeRedirect(new URLSearchParams(location.search).get('redirect'));

/**
 * Reflect the current session in the topbar: reveal the "Log out" button whenever a
 * visitor is signed in, and the Administrator-only "Gebruikers" link when they also
 * hold that role. Best-effort: a missing session just leaves both hidden.
 */
async function initSession(): Promise<void> {
  const me = await fetchCurrentUser();
  if (!me) return;
  if (hasRole(me, ROLE_ADMINISTRATOR)) $('admin-link').hidden = false;

  const logoutBtn = $<HTMLButtonElement>('logout-btn');
  logoutBtn.hidden = false;
  logoutBtn.addEventListener('click', () => {
    void withButton(logoutBtn, async () => {
      await logout();
      location.reload();
    });
  });
}
void initSession();

/** Client mirror of the server's credential rules (the server stays the source of truth). */
function validate(email: string, password: string): string | null {
  if (!email.includes('@')) return 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

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
    await apiJson<PersonView>('api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
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
    await apiJson<PersonView>('api/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    await apiJson<PersonView>('api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    location.assign(redirectTarget);
  });
});
