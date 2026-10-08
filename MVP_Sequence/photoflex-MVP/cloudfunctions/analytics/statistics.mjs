import { addDays, shanghaiDay } from './validation.mjs';
const core = new Set(['project_created','photos_imported','sequence_saved','export_generated']);
const percent = (count, total) => total ? Math.round(count / total * 10000) / 100 : null;
export function summarize(events, users, { from, to }, { now = Date.now(), excludedUsers = [], excludedVisitors = [], coverage = null, observationStart = null } = {}) {
  const excluded = new Set(excludedUsers);
  const visitorsExcluded = new Set(excludedVisitors);
  const sessions = new Map();
  for (const event of events) {
    if (event.user_id) { const ids = sessions.get(event.session_id) ?? new Set(); ids.add(event.user_id); sessions.set(event.session_id, ids); }
  }
  const resolved = events.map(event => {
    const linked = sessions.get(event.session_id);
    const user = event.user_id || (Object.hasOwn(event,'resolved_user_id') ? event.resolved_user_id : linked?.size === 1 ? [...linked][0] : null);
    return { ...event, user_id: user, day: shanghaiDay(event.occurred_at), person: user ? `u:${user}` : `v:${event.visitor_id}` };
  }).filter(event => !excluded.has(event.user_id) && !visitorsExcluded.has(event.visitor_id));
  const registered = users.filter(user => !excluded.has(user.user_id));
  const cohort = registered.filter(user => shanghaiDay(user.registered_at) >= from && shanghaiDay(user.registered_at) <= to);
  const selected = resolved.filter(event => event.day >= from && event.day <= to);
  const daily = [];
  for (let day = from; day <= to; day = addDays(day,1)) {
    const views = selected.filter(event => event.day === day && event.name === 'page_view');
    const accounts = new Set(views.filter(event => event.user_id).map(event => event.user_id)).size;
    const visitors = new Set(views.filter(event => !event.user_id).map(event => event.visitor_id)).size;
    daily.push({ day, views: views.length, people: accounts + visitors, accounts, visitors, registrations: cohort.filter(user => shanghaiDay(user.registered_at) === day).length });
  }
  const activeAccounts = new Set(selected.filter(event => core.has(event.name) && event.user_id).map(event => event.user_id)).size;
  const activeVisitors = new Set(selected.filter(event => core.has(event.name) && !event.user_id).map(event => event.visitor_id)).size;
  const activity = [...core].map(name => {
    const accounts = new Set(selected.filter(event => event.name === name && event.user_id).map(event => event.user_id)).size;
    const visitors = new Set(selected.filter(event => event.name === name && !event.user_id).map(event => event.visitor_id)).size;
    return { name,accounts,visitors,accounts_percent: percent(accounts,activeAccounts),visitors_percent: percent(visitors,activeVisitors) };
  });
  // Ordered account funnel, bounded by the selected end date. Each stage counts once.
  const stages = ['project_created','photos_imported','sequence_saved'];
  const counts = [cohort.length,0,0,0];
  for (const user of cohort) {
    let after = new Date(user.registered_at).getTime();
    const activity = selected.filter(event => event.user_id === user.user_id).sort((a,b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    for (let index = 0; index < stages.length; index++) {
      const event = activity.find(event => event.name === stages[index] && new Date(event.occurred_at).getTime() >= after);
      if (!event) break;
      counts[index + 1]++; after = new Date(event.occurred_at).getTime();
    }
  }
  const funnel = ['registered',...stages].map((name,index) => ({ name, accounts: counts[index], percent: percent(counts[index], counts[0]), step_percent: percent(counts[index], index ? counts[index-1] : counts[0]) }));
  const starts = selected.filter(event => event.name === 'export_started');
  const key = event => `${event.person}:${event.properties.attempt_id}`;
  const completions = new Set(resolved.filter(event => event.name === 'export_generated').map(key));
  const failures = resolved.filter(event => event.name === 'operation_failed' && event.properties.format);
  const conversions = ['pdf','jpeg','folder'].map(format => {
    const attempts = starts.filter(event => event.properties.format === format);
    const generated = attempts.filter(event => completions.has(key(event)));
    const categories = {};
    for (const attempt of attempts) {
      const failure = failures.find(event => key(event) === key(attempt));
      if (failure) categories[failure.properties.error_kind] = (categories[failure.properties.error_kind] || 0) + 1;
    }
    return { format, started: attempts.length, generated: generated.length, percent: percent(generated.length, attempts.length), accounts_started: new Set(attempts.filter(event => event.user_id).map(event => event.user_id)).size, accounts_generated: new Set(generated.filter(event => event.user_id).map(event => event.user_id)).size, visitors_started: new Set(attempts.filter(event => !event.user_id).map(event => event.visitor_id)).size, visitors_generated: new Set(generated.filter(event => !event.user_id).map(event => event.visitor_id)).size, failures: categories };
  });
  const today = shanghaiDay(now);
  const retention = [];
  for (let day = from; day <= to; day = addDays(day,1)) {
    const group = cohort.filter(user => shanghaiDay(user.registered_at) === day);
    const row = { day, accounts: group.length };
    for (const offset of [1,7]) {
      const target = addDays(day,offset);
      const mature = target < today;
      const observed = !observationStart || Date.parse(`${target}T00:00:00+08:00`) >= new Date(observationStart).getTime();
      const count = mature && observed ? group.filter(user => resolved.some(event => event.user_id === user.user_id && event.day === target && core.has(event.name))).length : null;
      row[`d${offset}`] = { status: !mature ? 'pending' : !observed ? 'unobserved' : 'mature', accounts: count, percent: mature && observed ? percent(count, group.length) : null };
    }
    retention.push(row);
  }
  return { timezone: 'Asia/Shanghai', from, to, generated_at: new Date(now).toISOString(), registration_source: coverage && new Date(coverage).getTime() >= Date.parse(`${addDays(to,1)}T00:00:00+08:00`) ? 'complete_auth_export' : 'observed_auth_profiles', auth_complete_through: coverage, daily, activity, funnel, conversions, retention };
}
