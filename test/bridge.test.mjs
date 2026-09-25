import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMuseExecArgs, museHeadlessSafetyFlags } from '../src/muse-env.mjs';
import { MuseBridge, normalizeConversationName } from '../src/bridge.mjs';

test('headless muse exec args', () => {
  assert.deepEqual(museHeadlessSafetyFlags(), ['--yolo', '--user-input-auto-resolve']);
  const args = buildMuseExecArgs({ prompt: 'ping', model: 'engine/measured', workspace: '/tmp/w' });
  assert.ok(args.includes('--yolo'));
  assert.ok(args.includes('--json'));
});

test('stub inject completes', async () => {
  const bridge = new MuseBridge({
    port: 0,
    museBin: 'muse',
    model: 'engine/measured',
    provider: 'meta',
    reasoningEffort: 'high',
    workspaceBase: '/tmp/muse-bridge-test-ws',
    stubMode: true,
  });
  const server = (await import('../src/server.mjs')).createServer({
    bridge,
    token: 'test-token',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/inject`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ conversation: 't1', message: 'hi' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.stub, true);
  assert.equal(normalizeConversationName(' Foo Bar! '), 'foo-bar');

  server.close();
});
