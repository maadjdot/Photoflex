import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createCloudBaseRepository } from './cloudbaseRepository.mjs';
test('RPC adapter sends only named parameters and never exposes backend keys in failures', async () => {
  const calls = [];
  const repository = createCloudBaseRepository('development-env','private-key',async (url,options) => { calls.push({ url,options }); return { ok: true,json: async () => true }; });
  await repository.insert([],{ id: 'verified-user',registered_at: '2026-10-08T00:00Z' });
  assert.equal(calls[0].url,'https://development-env.api.tcloudbasegateway.com/v1/rdb/rest/rpc/photoflex_analytics_ingest');
  assert.equal(calls[0].options.headers.Authorization,'Bearer private-key');
  assert.deepEqual(JSON.parse(calls[0].options.body),{ p_events: [],p_user_id: 'verified-user',p_registered_at: '2026-10-08T00:00Z' });
  const unavailable = createCloudBaseRepository('development-env','private-key',async () => ({ ok: false,json: async () => ({ message: 'private-key upstream failure' }) }));
  await assert.rejects(() => unavailable.read({ from: '2026-10-01',to: '2026-10-08' }),/^Error: database_unavailable$/);
});
test('CloudBase RPC migration performs atomic dedup, rejects end users and preserves project data', async () => {
  const database = new PGlite();
  try {
    await database.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; CREATE TABLE public.projects(id text PRIMARY KEY); INSERT INTO public.projects VALUES ('keep'); ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
    await database.exec(await readFile(new URL('./migrations/001_analytics.sql',import.meta.url),'utf8'));
    await database.exec(await readFile(new URL('./migrations/002_cloudbase_rpc.sql',import.meta.url),'utf8'));
    const event = { event_id: randomUUID(),visitor_id: randomUUID(),session_id: randomUUID(),occurred_at: '2026-10-08T04:00:00Z',name: 'page_view',feature: 'home',version: 'test',properties: {} };
    await database.exec('SET ROLE service_role');
    const insert = () => database.query('SELECT public.photoflex_analytics_ingest($1::jsonb,$2,$3)',[JSON.stringify([event]),'verified-user','2026-10-08T00:00Z']);
    await insert(); await insert();
    const report = (await database.query(`SELECT public.photoflex_analytics_read('2026-10-08','2026-10-08') AS result`)).rows[0].result;
    assert.equal(report.events.length,1); assert.equal(report.events[0].user_id,'verified-user'); assert.equal(report.users.length,1);
    const badEvent = { ...event,event_id: randomUUID(),session_id: randomUUID(),name: 'invalid' };
    await assert.rejects(() => database.query('SELECT public.photoflex_analytics_ingest($1::jsonb,$2,$3)',[JSON.stringify([badEvent]),'rejected-user','2026-10-08T00:00Z']));
    assert.equal((await database.query(`SELECT count(*)::integer AS count FROM public.analytics_auth_users WHERE user_id='rejected-user'`)).rows[0].count,0);
    await assert.rejects(() => database.query('DELETE FROM public.analytics_events'),/permission denied/);
    await database.exec('RESET ROLE');
    for (const role of ['anon','authenticated']) {
      await database.exec(`SET ROLE ${role}`);
      await assert.rejects(() => database.query(`SELECT public.photoflex_analytics_read('2026-10-08','2026-10-08')`),/permission denied/);
      await assert.rejects(() => insert(),/permission denied/);
      await database.exec('RESET ROLE');
    }
    assert.deepEqual((await database.query('SELECT * FROM public.projects')).rows,[{ id: 'keep' }]);
  } finally { await database.close(); }
});
