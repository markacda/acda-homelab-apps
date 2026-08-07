// Auth app — the /auth entry page. Served under the /auth/ proxy prefix (stripped
// before it reaches the app), so all API URLs stay RELATIVE (`fetch('api/login')`,
// never `/api/login`). The session cookies are httpOnly and set server-side on login,
// so this client never stores or reads a token itself.
//
// It renders one of two cards depending on `api/me` (issue #187): signed out, the
// sign-in / create-account forms; signed in, your own account page with your name,
// email and roles, and a form to change your name.
//
// The shared auth + DOM helpers come from @homelab/auth-client and @homelab/web-kit
// (issue #177), compiled in via tsconfig.client.json. This page installs NO fetch
// redirect guard: a 401 here means "signed out / bad credentials", surfaced inline.

import {
  apiJson,
  displayName,
  fetchCurrentUser,
  hasRole,
  logout,
  safeRedirect,
  ROLE_ADMINISTRATOR,
  type PersonView,
} from '../../../Common/auth-client/index.ts';
import { $, el, setStatus as webSetStatus } from '../../../Common/web-kit/index.ts';

/** Server-side minimum (Domain/Values/person-text MIN_PASSWORD_LENGTH); mirrored for early feedback. */
const MIN_PASSWORD_LENGTH = 8;
/** Server-side cap (Domain/Values/person-text MAX_NAME_LENGTH); mirrored for early feedback. */
const MAX_NAME_LENGTH = 100;

const statusEl = $('status');

/** Toggle the shared status banner below the cards. */
function setStatus(msg: string, kind: '' | 'ok' | 'error' = ''): void {
  statusEl.hidden = !msg;
  webSetStatus(statusEl, msg, kind);
}

const redirectTarget = safeRedirect(new URLSearchParams(location.search).get('redirect'));

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

/** Client mirror of the server's name rule (the server stays the source of truth). */
function validateName(firstName: string, lastName: string): string | null {
  if (!firstName) return 'Enter your first name.';
  if (!lastName) return 'Enter your last name.';
  for (const [label, value] of [
    ['First name', firstName],
    ['Last name', lastName],
  ]) {
    // Count code points so an emoji isn't charged twice, matching the server.
    if ([...value].length > MAX_NAME_LENGTH) return `${label} must be at most ${MAX_NAME_LENGTH} characters.`;
  }
  return null;
}

/** Client mirror of the server's credential rules. */
function validateCredentials(email: string, password: string): string | null {
  if (!email.includes('@')) return 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

// Account page ---------------------------------------------------------------

/**
 * Show the signed-in visitor's own details and prefill the rename form. Every value is
 * written as text (`textContent` / `el` text nodes), so a name containing markup renders
 * literally — the server-side cleaning in Domain/Values/person-text is the other half.
 */
function renderAccount(me: PersonView): void {
  $('account-name').textContent = displayName(me);
  $('account-first-name').textContent = me.firstName || '—';
  $('account-last-name').textContent = me.lastName || '—';
  $('account-email').textContent = me.email;
  $('account-roles').replaceChildren(
    ...(me.roles.length ? me.roles.map((role) => el('span', { class: 'tag' }, role)) : [el('span', { class: 'placeholder' }, 'None')])
  );

  $<HTMLInputElement>('profile-first-name').value = me.firstName;
  $<HTMLInputElement>('profile-last-name').value = me.lastName;
  $('profile-hint').hidden = Boolean(me.firstName && me.lastName);
}

$<HTMLFormElement>('profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const firstName = $<HTMLInputElement>('profile-first-name').value.trim();
  const lastName = $<HTMLInputElement>('profile-last-name').value.trim();
  const problem = validateName(firstName, lastName);
  if (problem) {
    setStatus(problem, 'error');
    return;
  }
  void withButton($<HTMLButtonElement>('profile-submit'), async () => {
    const updated = await apiJson<PersonView>('api/me', { method: 'PATCH', body: JSON.stringify({ firstName, lastName }) });
    renderAccount(updated);
    setStatus('Your name has been updated.', 'ok');
  });
});

/**
 * Decide which card to show. Signed in: reveal the account page (plus the "Log out"
 * button, and the Administrator-only "Gebruikers" link) and hide the forms. Signed out:
 * leave the forms as they are. Best-effort — a failed api/me just keeps the forms.
 */
async function initSession(): Promise<void> {
  const me = await fetchCurrentUser();
  if (!me) return;

  $('auth-card').hidden = true;
  $('account-card').hidden = false;
  renderAccount(me);

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

// Sign in / create account ---------------------------------------------------

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

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $<HTMLInputElement>('login-email').value.trim();
  const password = $<HTMLInputElement>('login-password').value;
  const problem = validateCredentials(email, password);
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
  const firstName = $<HTMLInputElement>('register-first-name').value.trim();
  const lastName = $<HTMLInputElement>('register-last-name').value.trim();
  const email = $<HTMLInputElement>('register-email').value.trim();
  const password = $<HTMLInputElement>('register-password').value;
  const confirm = $<HTMLInputElement>('register-confirm').value;
  const problem = validateName(firstName, lastName) ?? validateCredentials(email, password);
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
    await apiJson<PersonView>('api/register', { method: 'POST', body: JSON.stringify({ firstName, lastName, email, password }) });
    await apiJson<PersonView>('api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    location.assign(redirectTarget);
  });
});
