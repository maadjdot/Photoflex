import { readFile } from 'node:fs/promises';
import pg from 'pg';
// Input is a sanitized full export of authentication facts, not event-derived registrations.
const [path,completeThrough] = process.argv.slice(2);
if (!path || !Number.isFinite(Date.parse(completeThrough)) || Date.parse(completeThrough) > Date.now()) throw new Error('Usage: node import-auth-facts.mjs sanitized-facts.json complete-through-ISO');
const users = JSON.parse(await readFile(path,'utf8'));
if (!Array.isArray(users) || users.some(user => Object.keys(user).some(key => !['user_id','registered_at'].includes(key)) || typeof user.user_id !== 'string' || !/^[\w-]{1,128}$/.test(user.user_id) || !Number.isFinite(Date.parse(user.registered_at)) || Date.parse(user.registered_at) > Date.parse(completeThrough))) throw new Error('Invalid sanitized authentication export');
const pool = new pg.Pool({ connectionString: process.env.ANALYTICS_DATABASE_URL,max: 1 });
const connection = await pool.connect();
try {
  await connection.query('BEGIN');
  for (const user of users) await connection.query(`INSERT INTO public.analytics_auth_users(user_id,registered_at,source) VALUES ($1,$2,'auth_export') ON CONFLICT (user_id) DO UPDATE SET registered_at=EXCLUDED.registered_at,source='auth_export'`,[user.user_id,user.registered_at]);
  await connection.query(`INSERT INTO public.analytics_auth_coverage(singleton,complete_through) VALUES (true,$1) ON CONFLICT(singleton) DO UPDATE SET complete_through=GREATEST(analytics_auth_coverage.complete_through,EXCLUDED.complete_through)`,[completeThrough]);
  await connection.query('COMMIT');
  console.log(`Imported ${users.length} authentication facts.`);
} catch (error) { await connection.query('ROLLBACK'); throw error; }
finally { connection.release(); await pool.end(); }
