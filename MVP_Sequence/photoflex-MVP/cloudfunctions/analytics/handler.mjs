import { validateEvents, validateRange } from './validation.mjs';
import { summarize } from './statistics.mjs';

export function cloudbaseVerifier(envId, fetcher = fetch) {
  if (!/^[a-zA-Z0-9-]+$/.test(envId)) throw new Error('invalid_environment');
  return async token => {
    const response = await fetcher(`https://${envId}.api.tcloudbasegateway.com/auth/v1/user/me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'unauthorized' : 'auth_unavailable');
    const profile = await response.json();
    const id = profile.sub || profile.user_id;
    if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id) || profile.internal_user_type === 'anonymous' || (profile.status && profile.status !== 'ACTIVE')) throw new Error('unauthorized');
    const timestamp = Date.parse(profile.created_at);
    return { id, ...(Number.isFinite(timestamp) ? { registered_at: new Date(timestamp).toISOString() } : {}) };
  };
}

export function createHandler({ repository, verify, origins, adminIds = [], excludedUsers = [], excludedVisitors = [], now = () => Date.now() }) {
  return async ({ path, method, headers, body }) => {
    const origin = headers.origin;
    const cors = origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {};
    const reply = (status, value) => ({ status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: value });
    if (!origins.includes(origin)) return reply(403,{ error: 'origin_forbidden' });
    if (method === 'OPTIONS') return reply(204,null);
    if (method !== 'POST' || !['/events','/stats'].includes(path)) return reply(404,{ error: 'not_found' });
    let user = null;
    if (headers.authorization) {
      const match = /^Bearer (\S{1,4096})$/.exec(headers.authorization);
      if (!match) return reply(401,{ error: 'unauthorized' });
      try { user = await verify(match[1]); } catch (error) { return reply(error.message === 'unauthorized' ? 401 : 503,{ error: error.message === 'unauthorized' ? 'unauthorized' : 'unavailable' }); }
    }
    // Perform authorization before reading any statistics or parsing its query.
    if (path === '/stats' && (!user || !adminIds.includes(user.id))) return reply(403,{ error: 'forbidden' });
    let input;
    try { input = path === '/events' ? validateEvents(body,now()) : validateRange(body,now()); }
    catch { return reply(400,{ error: 'invalid_payload' }); }
    try {
      if (path === '/events') { await repository.insert(input,user); return reply(200,{ accepted: true }); }
      const data = await repository.read(input);
      return reply(200,summarize(data.events,data.users,input,{ now: now(), excludedUsers: [...adminIds,...excludedUsers], excludedVisitors, coverage: data.coverage, observationStart: data.observationStart }));
    } catch (error) { return reply(error.message === 'range_too_large' ? 422 : 503,{ error: error.message === 'range_too_large' ? 'range_too_large' : 'unavailable' }); }
  };
}
