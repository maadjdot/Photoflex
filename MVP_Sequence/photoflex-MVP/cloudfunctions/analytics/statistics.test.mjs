import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './statistics.mjs';
const range = { from: '2026-10-01',to: '2026-10-02' };
const options = { now: Date.parse('2026-10-09T04:00:00Z') };
const event = (name,time,user = 'one',session = 's1',properties = {}) => ({ name,occurred_at: time,user_id: user,session_id: session,visitor_id: 'v1',properties });
const users = [{ user_id: 'one',registered_at: '2026-09-30T16:01:00Z' },{ user_id: 'two',registered_at: '2026-10-01T05:00:00Z' }];
test('Shanghai day boundary, anonymous/login dedup and internal exclusion', () => {
  const result = summarize([event('page_view','2026-09-30T16:10:00Z',null),event('page_view','2026-10-01T03:00:00Z'),event('page_view','2026-10-01T07:00:00Z','internal','s2')],users,range,{ ...options,excludedUsers: ['internal'] });
  assert.equal(result.daily[0].views,2); assert.equal(result.daily[0].people,1); assert.equal(result.daily[0].visitors,0); assert.equal(result.daily[0].registrations,2);
});
test('shared-device sessions with multiple accounts do not arbitrarily bind anonymous activity', () => {
  const result = summarize([event('page_view','2026-10-01',null),event('page_view','2026-10-01','one'),event('page_view','2026-10-01','two')],users,range,options);
  assert.equal(result.daily[0].accounts,2); assert.equal(result.daily[0].visitors,1);
});
test('global ambiguous session binding is honored even when one account is outside the date range', () => {
  const anonymous = { ...event('page_view','2026-10-01',null),resolved_user_id: null };
  const account = { ...event('page_view','2026-10-01','one'),resolved_user_id: null };
  const result = summarize([anonymous,account],users,range,options);
  assert.equal(result.daily[0].visitors,1); assert.equal(result.daily[0].accounts,1);
});
test('activation is an ordered distinct-account funnel', () => {
  const result = summarize([event('sequence_saved','2026-10-01T01:00Z'),event('project_created','2026-10-01T02:00Z'),event('photos_imported','2026-10-01T03:00Z'),event('photos_imported','2026-10-01T04:00Z'),event('sequence_saved','2026-10-01T06:00Z')],users,range,options);
  assert.deepEqual(result.funnel.map(row => row.accounts),[2,1,1,1]); assert.equal(result.funnel[3].percent,50);
});
test('D1 and D7 use exact natural days, mature only after the target day ends', () => {
  const result = summarize([event('photos_imported','2026-10-02T01:00Z'),event('sequence_saved','2026-10-08T01:00Z')],users,range,{ now: Date.parse('2026-10-08T02:00Z') });
  assert.equal(result.retention[0].d1.accounts,1); assert.equal(result.retention[0].d1.percent,50); assert.equal(result.retention[0].d7.status,'pending'); assert.equal(result.retention[0].d7.accounts,null);
  assert.equal(summarize([event('sequence_saved','2026-10-08T01:00Z')],users,range,options).retention[0].d7.accounts,1);
});
test('export conversion matches attempts, includes later completion and separates failures', () => {
  const result = summarize([event('export_started','2026-10-02T15:59Z','one','s1',{ attempt_id: 'a',format: 'pdf' }),event('export_generated','2026-10-02T16:01Z','one','s1',{ attempt_id: 'a',format: 'pdf' }),event('export_generated','2026-10-02T05:00Z','one','s1',{ attempt_id: 'unmatched',format: 'pdf' }),event('export_started','2026-10-02T12:00Z','two','s2',{ attempt_id: 'b',format: 'pdf' }),event('operation_failed','2026-10-02T12:01Z','two','s2',{ attempt_id: 'b',format: 'pdf',error_kind: 'permission' })],users,range,options);
  assert.equal(result.conversions[0].started,2); assert.equal(result.conversions[0].generated,1); assert.equal(result.conversions[0].percent,50); assert.deepEqual(result.conversions[0].failures,{ permission: 1 });
});
test('does not present partial registration coverage as a complete count', () => {
  assert.equal(summarize([],users,range,options).registration_source,'observed_auth_profiles');
  assert.equal(summarize([],users,range,{ ...options,coverage: '2026-10-02T16:00:00Z' }).registration_source,'complete_auth_export');
});
test('retention before collection started is unobserved, not a zero-percent result', () => {
  const result = summarize([],users,range,{ ...options,observationStart: '2026-10-03T00:00:00Z' });
  assert.equal(result.retention[0].d1.status,'unobserved'); assert.equal(result.retention[0].d1.accounts,null);
});
