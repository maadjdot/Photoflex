import { addDays } from './validation.mjs';
export function createRepository(pool) {
  return {
    async insert(events, user) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        if (user?.registered_at) await connection.query(`INSERT INTO public.analytics_auth_users(user_id,registered_at,source) VALUES ($1,$2,'auth_profile') ON CONFLICT (user_id) DO NOTHING`, [user.id,user.registered_at]);
        for (const event of events) {
          if (user) await connection.query('INSERT INTO public.analytics_session_accounts(session_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[event.session_id,user.id]);
          if (event.name === 'signup_completed' && !user) continue;
          await connection.query(`INSERT INTO public.analytics_events(event_id,visitor_id,session_id,user_id,occurred_at,name,feature,version,properties) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (event_id) DO NOTHING`, [event.event_id,event.visitor_id,event.session_id,user?.id ?? null,event.occurred_at,event.name,event.feature,event.version,event.properties]);
        }
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
    async read(range) {
      const [events,users,coverage] = await Promise.all([
        pool.query(`SELECT e.*,s.resolved_user_id FROM public.analytics_events e LEFT JOIN (SELECT session_id,min(user_id) AS resolved_user_id FROM public.analytics_session_accounts GROUP BY session_id HAVING count(*)=1) s USING(session_id) WHERE occurred_at >= $1 AND occurred_at < $2 ORDER BY occurred_at LIMIT 100001`, [`${range.from}T00:00:00+08:00`,`${addDays(range.to,9)}T00:00:00+08:00`]),
        pool.query('SELECT user_id,registered_at FROM public.analytics_auth_users WHERE registered_at >= $1 AND registered_at < $2', [`${range.from}T00:00:00+08:00`,`${addDays(range.to,1)}T00:00:00+08:00`]),
        pool.query('SELECT (SELECT complete_through FROM public.analytics_auth_coverage WHERE singleton=true) AS complete_through, (SELECT min(received_at) FROM public.analytics_events) AS observation_start'),
      ]);
      if (events.rows.length > 100000) throw new Error('range_too_large');
      return { events: events.rows, users: users.rows, coverage: coverage.rows[0]?.complete_through ?? null, observationStart: coverage.rows[0]?.observation_start ?? null };
    },
  };
}
