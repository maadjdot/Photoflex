BEGIN;
-- service_role is the CloudBase backend API Key role. Never use it in a browser.
-- Grant only the operations required on the new analytics tables. Existing project permissions are untouched.
REVOKE ALL ON public.analytics_events,public.analytics_session_accounts,public.analytics_auth_users,public.analytics_auth_coverage FROM service_role;
GRANT SELECT,INSERT ON public.analytics_events,public.analytics_session_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.analytics_auth_users,public.analytics_auth_coverage TO service_role;

CREATE FUNCTION public.photoflex_analytics_ingest(p_events jsonb,p_user_id text,p_registered_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  IF p_user_id IS NOT NULL AND p_registered_at IS NOT NULL THEN
    INSERT INTO public.analytics_auth_users(user_id,registered_at,source) VALUES (p_user_id,p_registered_at,'auth_profile') ON CONFLICT(user_id) DO NOTHING;
  END IF;
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.analytics_session_accounts(session_id,user_id)
    SELECT DISTINCT (e->>'session_id')::uuid,p_user_id FROM jsonb_array_elements(p_events) e ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.analytics_events(event_id,visitor_id,session_id,user_id,occurred_at,name,feature,version,properties)
  SELECT (e->>'event_id')::uuid,(e->>'visitor_id')::uuid,(e->>'session_id')::uuid,p_user_id,(e->>'occurred_at')::timestamptz,e->>'name',e->>'feature',e->>'version',e->'properties'
  FROM jsonb_array_elements(p_events) e WHERE e->>'name' <> 'signup_completed' OR p_user_id IS NOT NULL ON CONFLICT(event_id) DO NOTHING;
  RETURN true;
END $$;

CREATE FUNCTION public.photoflex_analytics_read(p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_events jsonb; v_users jsonb;
BEGIN
  IF p_from > p_to OR p_to-p_from >= 90 THEN RAISE EXCEPTION 'invalid_range'; END IF;
  SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) INTO v_events FROM (
    SELECT e.*,s.resolved_user_id FROM public.analytics_events e
    LEFT JOIN (SELECT session_id,min(user_id) AS resolved_user_id FROM public.analytics_session_accounts GROUP BY session_id HAVING count(*)=1) s USING(session_id)
    WHERE occurred_at >= (p_from::timestamp AT TIME ZONE 'Asia/Shanghai') AND occurred_at < ((p_to+9)::timestamp AT TIME ZONE 'Asia/Shanghai')
    ORDER BY occurred_at LIMIT 100001
  ) t;
  IF jsonb_array_length(v_events)>100000 THEN RAISE EXCEPTION 'range_too_large'; END IF;
  SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) INTO v_users FROM (
    SELECT user_id,registered_at FROM public.analytics_auth_users WHERE registered_at >= (p_from::timestamp AT TIME ZONE 'Asia/Shanghai') AND registered_at < ((p_to+1)::timestamp AT TIME ZONE 'Asia/Shanghai')
  ) t;
  RETURN jsonb_build_object('events',v_events,'users',v_users,'coverage',(SELECT complete_through FROM public.analytics_auth_coverage WHERE singleton=true),'observationStart',(SELECT min(received_at) FROM public.analytics_events));
END $$;

CREATE FUNCTION public.photoflex_analytics_import_auth(p_users jsonb,p_complete_through timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF jsonb_typeof(p_users)<>'array' OR p_complete_through>now() THEN RAISE EXCEPTION 'invalid_auth_facts'; END IF;
  INSERT INTO public.analytics_auth_users(user_id,registered_at,source)
  SELECT u->>'user_id',(u->>'registered_at')::timestamptz,'auth_export' FROM jsonb_array_elements(p_users) u
  ON CONFLICT(user_id) DO UPDATE SET registered_at=EXCLUDED.registered_at,source='auth_export';
  INSERT INTO public.analytics_auth_coverage(singleton,complete_through) VALUES (true,p_complete_through)
  ON CONFLICT(singleton) DO UPDATE SET complete_through=GREATEST(analytics_auth_coverage.complete_through,EXCLUDED.complete_through);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.photoflex_analytics_ingest(jsonb,text,timestamptz),public.photoflex_analytics_read(date,date),public.photoflex_analytics_import_auth(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.photoflex_analytics_ingest(jsonb,text,timestamptz),public.photoflex_analytics_read(date,date),public.photoflex_analytics_import_auth(jsonb,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
