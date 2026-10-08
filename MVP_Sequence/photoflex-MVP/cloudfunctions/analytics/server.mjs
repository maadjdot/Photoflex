import { createServer } from 'node:http';
import { createHandler, cloudbaseVerifier } from './handler.mjs';
import { createCloudBaseRepository } from './cloudbaseRepository.mjs';

const list = name => (process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean);
const origins = list('ANALYTICS_ALLOWED_ORIGINS');
const apiKey = process.env.CLOUDBASE_ANALYTICS_API_KEY || process.env.CLOUDBASE_APIKEY;
if (!apiKey || !process.env.CLOUDBASE_ENV_ID || !origins.length) throw new Error('Missing analytics service configuration');
const handle = createHandler({ repository: createCloudBaseRepository(process.env.CLOUDBASE_ENV_ID,apiKey), verify: cloudbaseVerifier(process.env.CLOUDBASE_ENV_ID), origins, adminIds: list('ANALYTICS_ADMIN_IDS'), excludedUsers: list('ANALYTICS_INTERNAL_USER_IDS'), excludedVisitors: list('ANALYTICS_INTERNAL_VISITOR_IDS') });
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
