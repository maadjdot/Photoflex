/** Shared CloudBase PostgreSQL instances expose HTTP/RPC, not a TCP endpoint. */
export function createCloudBaseRepository(envId, apiKey, fetcher = fetch) {
  if (!/^[a-zA-Z0-9-]+$/.test(envId) || !apiKey) throw new Error('Missing backend database configuration');
  const rpc = async (name, parameters) => {
    const response = await fetcher(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`, {
      method: 'POST',headers: { Authorization: `Bearer ${apiKey}`,'Content-Type': 'application/json' },body: JSON.stringify(parameters),signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      let result; try { result = await response.json(); } catch { /* Never expose upstream bodies or credentials. */ }
      throw new Error(result?.message === 'range_too_large' ? 'range_too_large' : 'database_unavailable');
    }
    return response.json();
  };
  return {
    insert: (events,user) => rpc('photoflex_analytics_ingest',{ p_events: events,p_user_id: user?.id ?? null,p_registered_at: user?.registered_at ?? null }),
    read: range => rpc('photoflex_analytics_read',{ p_from: range.from,p_to: range.to }),
    importAuthFacts: (users,completeThrough) => rpc('photoflex_analytics_import_auth',{ p_users: users,p_complete_through: completeThrough }),
  };
}
