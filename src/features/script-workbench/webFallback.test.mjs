import test from 'node:test';
import assert from 'node:assert/strict';

test('web createScript returns a failure result when localStorage rejects the write', async () => {
  let createWebScriptFallback;
  try {
    ({ createWebScriptFallback } = await import('./webScriptFallback.ts'));
  } catch {
    // The first TDD run intentionally reaches the assertion without an implementation.
  }

  assert.equal(typeof createWebScriptFallback, 'function');
  const result = createWebScriptFallback(
    () => ({ id: 'script-1' }),
    () => [],
    () => {
      throw new Error('quota exceeded');
    },
  );

  assert.equal(result.ok, false);
  assert.match(result.message ?? '', /失败/);
});
