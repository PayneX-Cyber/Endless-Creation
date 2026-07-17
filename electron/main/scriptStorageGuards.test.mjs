import test from 'node:test';
import assert from 'node:assert/strict';

test('normalizeScriptId rejects path traversal and separators', async () => {
  let normalizeScriptId;
  try {
    ({ normalizeScriptId } = await import('./scriptStorageGuards.ts'));
  } catch {
    // The first TDD run intentionally reaches the assertion without an implementation.
  }

  assert.equal(typeof normalizeScriptId, 'function');
  assert.equal(normalizeScriptId('script-safe_1.2'), 'script-safe_1.2');
  assert.equal(normalizeScriptId('../outside'), null);
  assert.equal(normalizeScriptId('nested/script'), null);
  assert.equal(normalizeScriptId('nested\\script'), null);
  assert.equal(normalizeScriptId('.'), null);
  assert.equal(normalizeScriptId('..'), null);
  assert.equal(normalizeScriptId(''), null);
});
