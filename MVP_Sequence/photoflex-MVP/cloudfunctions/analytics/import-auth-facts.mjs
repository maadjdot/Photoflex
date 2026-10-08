import { readFile } from 'node:fs/promises';
import { createCloudBaseRepository } from './cloudbaseRepository.mjs';
// Input is a sanitized full export of authentication facts, not event-derived registrations.
const [path,completeThrough] = process.argv.slice(2);
if (!path || !Number.isFinite(Date.parse(completeThrough)) || Date.parse(completeThrough) > Date.now()) throw new Error('Usage: node import-auth-facts.mjs sanitized-facts.json complete-through-ISO');
const users = JSON.parse(await readFile(path,'utf8'));
if (!Array.isArray(users) || users.some(user => Object.keys(user).some(key => !['user_id','registered_at'].includes(key)) || typeof user.user_id !== 'string' || !/^[\w-]{1,128}$/.test(user.user_id) || !Number.isFinite(Date.parse(user.registered_at)) || Date.parse(user.registered_at) > Date.parse(completeThrough))) throw new Error('Invalid sanitized authentication export');
await createCloudBaseRepository(process.env.CLOUDBASE_ENV_ID,process.env.CLOUDBASE_ANALYTICS_API_KEY).importAuthFacts(users,completeThrough);
console.log(`Imported ${users.length} authentication facts.`);
