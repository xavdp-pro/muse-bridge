import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../src/config.mjs';

test('loadConfig halts without model when not stub', () => {
  assert.throws(
    () => loadConfig({ BRIDGE_MUSE_STUB: '0', MUSE_MODEL: '' }),
    ConfigError,
  );
});

test('loadConfig allows stub without model', () => {
  const c = loadConfig({ BRIDGE_MUSE_STUB: '1', MUSE_MODEL: '' });
  assert.equal(c.stubMode, true);
  assert.equal(c.model, null);
});
