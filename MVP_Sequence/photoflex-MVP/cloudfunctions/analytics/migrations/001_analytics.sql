BEGIN;
-- Additive only: never reads or alters public.projects or authentication tables.
CREATE TABLE public.analytics_events (
  event_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  user_id text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (name IN ('page_view','signup_completed','project_created','photo_import_started','photos_imported','sequence_saved','export_started','export_generated','operation_failed')),
  feature text NOT NULL CHECK (feature IN ('home','project','contact_sheet','table','sequence','frame','layout','compare','account','photo_import')),
  version varchar(64) NOT NULL,
  properties jsonb NOT NULL CHECK (jsonb_typeof(properties) = 'object' AND pg_column_size(properties) <= 1024)
);
CREATE INDEX analytics_events_time ON public.analytics_events (occurred_at);
CREATE INDEX analytics_events_session ON public.analytics_events (session_id, user_id);
CREATE INDEX analytics_events_user_time ON public.analytics_events (user_id, occurred_at);
CREATE TABLE public.analytics_session_accounts (
  session_id uuid NOT NULL,
  user_id text NOT NULL,
  PRIMARY KEY (session_id,user_id)
);
CREATE TABLE public.analytics_auth_users (
  user_id text PRIMARY KEY,
  registered_at timestamptz NOT NULL,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('auth_profile','auth_export'))
);
CREATE TABLE public.analytics_auth_coverage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  complete_through timestamptz NOT NULL
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_auth_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_auth_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_auth_coverage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_session_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_session_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_session_accounts FROM PUBLIC;
REVOKE ALL ON public.analytics_events, public.analytics_auth_users, public.analytics_auth_coverage FROM PUBLIC;
-- CloudBase may install default grants for client roles on newly created tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.analytics_session_accounts FROM anon;
    REVOKE ALL ON public.analytics_events, public.analytics_auth_users, public.analytics_auth_coverage FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.analytics_session_accounts FROM authenticated;
    REVOKE ALL ON public.analytics_events, public.analytics_auth_users, public.analytics_auth_coverage FROM authenticated;
  END IF;
END $$;
-- No anon/authenticated policy: end users cannot read or write any analytics table.
-- The CloudBase service_role backend grants are installed separately by migration 002.
COMMIT;
