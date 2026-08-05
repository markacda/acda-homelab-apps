import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { pingDb } from '../health.ts';
import { currentTags } from '../../access-log/logger.ts';

// pingDb runs the liveness query inside a "Healthcheck" tag scope so the postgres
// dependency the instrumented pool records for it is tagged (and hidden by
// default in the Log Viewer). We assert the scope is active during the query.
test('pingDb runs SELECT 1 within a Healthcheck tag scope', async () => {
  let seenSql: unknown;
  let seenTags: readonly string[] | undefined;
  const fakePool = {
    query: async (sql: unknown) => {
      seenSql = sql;
      seenTags = currentTags();
      return { rows: [] };
    },
  } as unknown as Pool;

  await pingDb(fakePool);
  assert.equal(seenSql, 'SELECT 1');
  assert.deepEqual(seenTags, ['Healthcheck']);
  assert.equal(currentTags(), undefined); // scope is exited after the ping
});
