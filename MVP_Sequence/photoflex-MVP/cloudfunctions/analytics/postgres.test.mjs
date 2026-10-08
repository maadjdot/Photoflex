import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createRepository } from './repository.mjs';
import { createHandler } from './handler.mjs';
test('real PostgreSQL migration, deduplication, account attribution and table permissions', async () => {
  const database = new PGlite();
  try {
    await database.exec(`CREATE TABLE public.projects (id text PRIMARY KEY, owner_id text, payload jsonb); INSERT INTO public.projects VALUES ('existing','owner','{"keep":"intact"}'); CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO anon,authenticated; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated;`);
    await database.exec(await readFile(new URL('./migrations/001_analytics.sql',import.meta.url),'utf8'));
    const pool = { query: (sql,params) => database.query(sql,params),connect: async () => ({ query: (sql,params) => database.query(sql,params),release() {} }) };
    const repository = createRepository(pool);
    const now = Date.parse('2026-10-08T04:00:00Z');
    const handler = createHandler({ repository,verify: async token => ({ id: token,registered_at: '2026-10-08T03:00:00Z' }),origins: ['http://localhost:4173'],adminIds: ['admin'],now: () => now });
    const event = { event_id: randomUUID(),visitor_id: randomUUID(),session_id: randomUUID(),occurred_at: new Date(now).toISOString(),name: 'page_view',feature: 'home',version: 'test',properties: {} };
    await database.exec('SET ROLE photoflex_analytics');
    const request = token => ({ path: '/events',method: 'POST',headers: { origin: 'http://localhost:4173',...(token ? { authorization: `Bearer ${token}` } : {}) },body: { events: [event] } });
    assert.equal((await handler(request(null))).status,200);
    assert.equal((await handler(request('user-a'))).status,200);
    assert.equal((await database.query('SELECT count(*)::integer AS count FROM analytics_events')).rows[0].count,1);
    assert.equal((await database.query('SELECT user_id FROM analytics_events')).rows[0].user_id,null); // Replay cannot rewrite the original event.
    event.event_id = randomUUID();
    assert.equal((await handler(request('user-a'))).status,200);
    event.event_id = randomUUID(); event.session_id = randomUUID(); event.visitor_id = randomUUID();
    assert.equal((await handler(request('user-b'))).status,200);
    const stats = { path: '/stats',method: 'POST',headers: { origin: 'http://localhost:4173',authorization: 'Bearer admin' },body: { from: '2026-10-08',to: '2026-10-08' } };
    const report = await handler(stats);
    assert.equal(report.status,200); assert.equal(report.body.daily[0].people,2); assert.equal(report.body.daily[0].visitors,0);
    assert.equal((await handler({ ...stats,headers: { ...stats.headers,authorization: 'Bearer user-a' } })).status,403);
    await assert.rejects(() => database.query('SELECT * FROM public.projects'),/permission denied/);
    await assert.rejects(() => database.query('DELETE FROM public.analytics_events'),/permission denied/);
    await database.exec('RESET ROLE');
    for (const role of ['anon','authenticated']) {
      await database.exec(`SET ROLE ${role}`);
      for (const table of ['analytics_events','analytics_auth_users','analytics_auth_coverage','analytics_session_accounts']) await assert.rejects(() => database.query(`SELECT * FROM public.${table}`),/permission denied/);
      await assert.rejects(() => database.query(`INSERT INTO public.analytics_events SELECT * FROM public.analytics_events`),/permission denied/);
      await database.exec('RESET ROLE');
    }
    assert.deepEqual((await database.query('SELECT * FROM public.projects')).rows,[{ id: 'existing',owner_id: 'owner',payload: { keep: 'intact' } }]);
  } finally { await database.close(); }
});
