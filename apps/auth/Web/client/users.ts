// Auth app — Administrator-only role management page (issue #152). Served under
// the /auth/ proxy prefix (stripped before it reaches the app), so all API URLs
// stay RELATIVE (`fetch('api/users')`, never `/api/users`). The session cookie is
// httpOnly and sent automatically; this client never stores or reads a token.
//
// The shared auth + DOM helpers come from @homelab/auth-client and @homelab/web-kit
// (issue #177), compiled in via tsconfig.client.json.

import { apiJson as api, displayName, fetchCurrentUser, hasRole, ROLE_ADMINISTRATOR, type PersonView } from '../../../Common/auth-client/index.ts';
import { $, el, setStatus as webSetStatus } from '../../../Common/web-kit/index.ts';

/** The roles assignable via the admin API — mirrors the server's ASSIGNABLE_ROLES. */
const ASSIGNABLE_ROLES = ['User', 'Administrator'];

/** A copy of the roles in alphabetical order, for stable tag rendering. */
function sortedRoles(roles: string[]): string[] {
  return [...roles].sort((a, b) => a.localeCompare(b));
}

/**
 * The Name cell. Unlike the shared `displayName` this shows an em dash for an account
 * with no name yet (issue #187) instead of falling back to the email, which has its
 * own column right beside it.
 */
function fullName(user: PersonView): string {
  return `${user.firstName} ${user.lastName}`.trim() || '—';
}

const statusEl = $('status');
/** Set the status banner, hiding it when empty. */
function setStatus(msg: string, kind: '' | 'error' = ''): void {
  statusEl.hidden = !msg;
  webSetStatus(statusEl, msg, kind);
}

// icons: no icon library in the repo; small inline SVGs, currentColor

function icon(kind: 'pen' | 'bin'): SVGSVGElement {
  const paths: Record<typeof kind, string> = {
    pen: 'M4 20h4l10-10-4-4L4 16v4zM14 6l4 4',
    bin: 'M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[kind]);
  svg.append(path);
  return svg;
}

let users: PersonView[] = [];
let searchTerm = '';

const usersEl = $('users');

function renderTable(): void {
  if (users.length === 0) {
    usersEl.replaceChildren(el('p', { class: 'placeholder' }, searchTerm ? 'No users match that search.' : 'No users yet.'));
    return;
  }
  const rows = users.map((u) => {
    const roleCell = el('td', {}, ...sortedRoles(u.roles).map((r) => el('span', { class: 'tag' }, r)));
    const editBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Edit roles for ${displayName(u)}` }, icon('pen'));
    editBtn.addEventListener('click', () => openModal(u.id));
    return el(
      'tr',
      {},
      el('td', { class: 'cell-name' }, fullName(u)),
      el('td', { class: 'cell-email' }, u.email),
      roleCell,
      el('td', { class: 'cell-actions' }, editBtn)
    );
  });
  const table = el(
    'table',
    { class: 'users-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Email'), el('th', {}, 'Roles'), el('th', {}, ''))),
    el('tbody', {}, ...rows)
  );
  usersEl.replaceChildren(table);
}

async function loadUsers(): Promise<void> {
  const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
  const fetched = await api<PersonView[]>(`api/users${query}`);
  users = fetched.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  renderTable();
  refreshOpenModal();
}

let overlay: HTMLElement | undefined;
let editingId: string | undefined;
let keyHandler: ((ev: KeyboardEvent) => void) | undefined;

function closeModal(): void {
  overlay?.remove();
  overlay = undefined;
  editingId = undefined;
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = undefined;
  }
}

/** Rebuild the modal body from the current user state (called after each change). */
function refreshOpenModal(): void {
  if (!editingId || !overlay) return;
  const user = users.find((u) => u.id === editingId);
  if (!user) {
    closeModal();
    return;
  }

  const assigned = el(
    'div',
    { class: 'role-group' },
    el('h4', {}, 'Assigned roles'),
    el(
      'div',
      { class: 'tags' },
      ...(user.roles.length
        ? sortedRoles(user.roles).map((role) => {
            const remove = el('button', { type: 'button', class: 'tag-btn', 'aria-label': `Remove ${role}` }, icon('bin'));
            remove.addEventListener('click', () =>
              mutate(() => api<PersonView>(`api/users/${user.id}/roles/${encodeURIComponent(role)}`, { method: 'DELETE' }))
            );
            return el('span', { class: 'tag' }, role, remove);
          })
        : [el('span', { class: 'placeholder' }, 'No roles assigned.')])
    )
  );

  const addable = sortedRoles(ASSIGNABLE_ROLES.filter((r) => !user.roles.includes(r)));
  const add = el(
    'div',
    { class: 'role-group' },
    el('h4', {}, 'Add a role'),
    el(
      'div',
      { class: 'tags' },
      ...(addable.length
        ? addable.map((role) => {
            const plus = el('button', { type: 'button', class: 'tag-btn', 'aria-label': `Add ${role}` }, '+');
            plus.addEventListener('click', () =>
              mutate(() => api<PersonView>(`api/users/${user.id}/roles`, { method: 'POST', body: JSON.stringify({ role }) }))
            );
            return el('span', { class: 'tag tag-add' }, role, plus);
          })
        : [el('span', { class: 'placeholder' }, 'All roles assigned.')])
    )
  );

  const body = $('modal-body');
  body.replaceChildren(el('p', { class: 'modal-name' }, fullName(user)), el('p', { class: 'modal-email' }, user.email), assigned, add);
}

function openModal(id: string): void {
  closeModal();
  editingId = id;

  const closeBtn = el('button', { type: 'button', class: 'modal-close', 'aria-label': 'Close' }, '×');
  closeBtn.addEventListener('click', closeModal);

  const dialog = el(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Edit user roles' },
    el('header', { class: 'modal-header' }, el('h3', {}, 'Edit roles'), closeBtn),
    el('div', { id: 'modal-body', class: 'modal-body' })
  );
  // Clicks inside the dialog must not fall through to the overlay's dismiss.
  dialog.addEventListener('click', (ev) => ev.stopPropagation());

  overlay = el('div', { class: 'modal-overlay' }, dialog);
  overlay.addEventListener('click', closeModal); // backdrop click dismisses
  document.body.append(overlay);

  keyHandler = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', keyHandler);

  refreshOpenModal();
}

/** Run a role mutation, then reload the list (which re-renders table + modal). */
async function mutate(run: () => Promise<PersonView>): Promise<void> {
  try {
    setStatus('');
    await run();
    await loadUsers();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), 'error');
  }
}

let searchTimer: number | undefined;
$<HTMLInputElement>('search').addEventListener('input', (e) => {
  const value = (e.target as HTMLInputElement).value.trim();
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    searchTerm = value;
    void loadUsers().catch((err) => setStatus(err instanceof Error ? err.message : String(err), 'error'));
  }, 200);
});

async function init(): Promise<void> {
  const me = await fetchCurrentUser();
  if (!me) {
    // Not signed in — bounce to the login page and return here afterwards.
    location.assign(`index.html?redirect=${encodeURIComponent('/auth/users.html')}`);
    return;
  }
  if (!hasRole(me, ROLE_ADMINISTRATOR)) {
    usersEl.replaceChildren(el('p', { class: 'placeholder' }, 'Access denied — this page is for Administrators only.'));
    $<HTMLInputElement>('search').disabled = true;
    return;
  }
  await loadUsers();
}

void init().catch((err) => setStatus(err instanceof Error ? err.message : String(err), 'error'));
