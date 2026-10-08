import { createServer } from 'node:http';
import pg from 'pg';
import { createHandler, cloudbaseVerifier } from './handler.mjs';
import { createRepository } from './repository.mjs';

const list = name => (process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean);
const origins = list('ANALYTICS_ALLOWED_ORIGINS');
if (!process.env.ANALYTICS_DATABASE_URL || !process.env.CLOUDBASE_ENV_ID || !origins.length) throw new Error('Missing analytics service configuration');
const pool = new pg.Pool({ connectionString: process.env.ANALYTICS_DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 10000 });
const handle = createHandler({ repository: createRepository(pool), verify: cloudbaseVerifier(process.env.CLOUDBASE_ENV_ID), origins, adminIds: list('ANALYTICS_ADMIN_IDS'), excludedUsers: list('ANALYTICS_INTERNAL_USER_IDS'), excludedVisitors: list('ANALYTICS_INTERNAL_VISITOR_IDS') });
createServer(async (request,response) => {
  const path = new URL(request.url,'http://localhost').pathname;
  if (path === '/health' && request.method === 'GET') { response.writeHead(200,{ 'Content-Type': 'application/json' }); response.end('{"ok":true}'); return; }
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 16384) { response.writeHead(413); response.end(); return; }
      chunks.push(chunk);
    }
    let body;
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined; }
    catch { response.writeHead(400); response.end(); return; }
    const result = await handle({ path, method: request.method, headers: request.headers, body });
    response.writeHead(result.status,result.headers); response.end(result.body === null ? undefined : JSON.stringify(result.body));
  } catch { response.writeHead(503); response.end(); }
}).listen(Number(process.env.PORT || 9000),'0.0.0.0');
