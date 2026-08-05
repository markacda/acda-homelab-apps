import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirect, buildLoginRedirectUrl, hasRole, ROLE_ADMINISTRATOR, ROLE_USER } from '../index.ts';

test('safeRedirect keeps a same-origin root-relative path', () => {
  assert.equal(safeRedirect('/logs/#/requests'), '/logs/#/requests');
  assert.equal(safeRedirect('/recepten'), '/recepten');
});

test('safeRedirect rejects off-site and scheme-relative targets', () => {
  assert.equal(safeRedirect('//evil.com'), '/');
  assert.equal(safeRedirect('/\\evil.com'), '/');
  assert.equal(safeRedirect('https://evil.com'), '/');
  assert.equal(safeRedirect('javascript:alert(1)'), '/');
  assert.equal(safeRedirect('relative/path'), '/');
});

test('safeRedirect falls back to root for empty/missing input', () => {
  assert.equal(safeRedirect(null), '/');
  assert.equal(safeRedirect(''), '/');
});

test('buildLoginRedirectUrl round-trips the current location, encoded', () => {
  assert.equal(buildLoginRedirectUrl('/logs/#/requests'), '/auth/?redirect=%2Flogs%2F%23%2Frequests');
  assert.equal(buildLoginRedirectUrl('/recepten?q=a&b=c'), '/auth/?redirect=%2Frecepten%3Fq%3Da%26b%3Dc');
});

test('hasRole checks membership against the role list', () => {
  const admin = { id: '1', email: 'a@b.c', roles: [ROLE_USER, ROLE_ADMINISTRATOR] };
  const user = { id: '2', email: 'd@e.f', roles: [ROLE_USER] };
  assert.equal(hasRole(admin, ROLE_ADMINISTRATOR), true);
  assert.equal(hasRole(user, ROLE_ADMINISTRATOR), false);
  assert.equal(hasRole(user, ROLE_USER), true);
});
