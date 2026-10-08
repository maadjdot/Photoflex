import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHandler, cloudbaseVerifier } from './handler.mjs';
import { validateEvents } from './validation.mjs';
const now = Date.parse('2026-10-08T04:00:00Z');
const event = (values = {}) => ({ event_id: randomUUID(),visitor_id: randomUUID(),session_id: randomUUID(),occurred_at: new Date(now).toISOString(),name: 'page_view',feature: 'home',version: 'c941996',properties: {},...values });
const request = (body, values = {}) => ({ path: '/events',method: 'POST',headers: { origin: 'http://localhost:4173' },body,...values });
test('accepts unauthenticated visitors without creating an anonymous CloudBase account', async () => {
  let received;
  const handler = createHandler({ repository: { insert: async (...args) => { received = args; } },verify: async () => { throw new Error('should not authenticate'); },origins: ['http://localhost:4173'],now: () => now });
  assert.equal((await handler(request({ events: [event()] }))).status,200);
  assert.equal(received[1],null);
});
test('verifies token and takes identity only from CloudBase', async () => {
  let received;
  const handler = createHandler({ repository: { insert: async (...args) => { received = args; } },verify: async token => { assert.equal(token,'test-token'); return { id: 'real-user' }; },origins: ['http://localhost:4173'],now: () => now });
  assert.equal((await handler(request({ events: [event()] },{ headers: { origin: 'http://localhost:4173',authorization: 'Bearer test-token' } }))).status,200);
  assert.equal(received[1].id,'real-user');
  assert.equal((await handler(request({ events: [event({ user_id: 'forged-admin' })] }))).status,400);
});
test('ordinary accounts and visitors cannot read statistics', async () => {
  let reads = 0;
  const handler = createHandler({ repository: { read: async () => { reads++; } },verify: async () => ({ id: 'ordinary' }),adminIds: ['admin'],origins: ['http://localhost:4173'],now: () => now });
  for (const authorization of [undefined,'Bearer ordinary']) assert.equal((await handler(request({ from: '2026-10-01',to: '2026-10-08' },{ path: '/stats',headers: { origin: 'http://localhost:4173',authorization } }))).status,403);
  assert.equal(reads,0);
});
test('valid administrator receives aggregate metrics and is excluded from them', async () => {
  const handler = createHandler({ repository: { read: async () => ({ events: [event({ user_id: 'admin' })],users: [{ user_id: 'admin',registered_at: new Date(now).toISOString() }] }) },verify: async () => ({ id: 'admin' }),adminIds: ['admin'],origins: ['http://localhost:4173'],now: () => now });
  const result = await handler(request({ from: '2026-10-08',to: '2026-10-08' },{ path: '/stats',headers: { origin: 'http://localhost:4173',authorization: 'Bearer admin' } }));
  assert.equal(result.status,200); assert.equal(result.body.daily[0].people,0); assert.equal(result.body.funnel[0].accounts,0);
});
test('invalid tokens are rejected rather than silently treated as visitor activity', async () => {
  const handler = createHandler({ repository: { insert: async () => assert.fail() },verify: async () => { throw new Error('unauthorized'); },origins: ['http://localhost:4173'],now: () => now });
  assert.equal((await handler(request({ events: [event()] },{ headers: { origin: 'http://localhost:4173',authorization: 'Bearer bad' } }))).status,401);
});
test('rejects content, paths, arbitrary properties, oversized batches, old/future timestamps', () => {
  for (const change of [{ properties: { filename: 'private.jpg' } },{ properties: { memo: 'private' } },{ url: '#/projects/private-id' },{ occurred_at: '2026-01-01' },{ occurred_at: '2027-01-01' },{ properties: { count: 1.2 } }]) assert.throws(() => validateEvents({ events: [event(change)] },now));
  assert.throws(() => validateEvents({ events: Array.from({ length: 21 },() => event()) },now));
});
test('upstream profile fields are reduced to ID and verified registration timestamp', async () => {
  const verify = cloudbaseVerifier('development-env',async (url,options) => {
    assert.equal(url,'https://development-env.api.tcloudbasegateway.com/auth/v1/user/me');
    assert.equal(options.headers.Authorization,'Bearer token');
    return { ok: true,json: async () => ({ sub: '100052883805',created_at: '2026-10-01T00:00:00Z',status: 'ACTIVE',email: 'never-store@example.com',name: 'Never store' }) };
  });
  assert.deepEqual(await verify('token'),{ id: '100052883805',registered_at: '2026-10-01T00:00:00.000Z' });
});
