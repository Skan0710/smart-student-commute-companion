-- =============================================================================
-- Smart Student Commute Companion - Supabase PostgreSQL Schema
-- =============================================================================
-- Execute this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Run
-- =============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  college_name TEXT NOT NULL DEFAULT 'Dwarkadas J. Sanghvi College of Engineering',
  profile_picture TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 2. STUDENT PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL DEFAULT 'Computer Engineering',
  roll_no TEXT DEFAULT '60004220000',
  home_station TEXT DEFAULT 'Vile Parle',
  preferred_corridor TEXT DEFAULT 'Western Railway (Churchgate - Dahanu)',
  max_walking_minutes INTEGER DEFAULT 15,
  railway_concession_status TEXT DEFAULT 'eligible',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_student_profiles_user UNIQUE (user_id)
);

-- 3. COURSES TABLE
CREATE TABLE IF NOT EXISTS public.courses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  instructor TEXT,
  credits INTEGER DEFAULT 3,
  color TEXT DEFAULT '#0047ff',
  semester INTEGER DEFAULT 1,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_courses_user ON public.courses(user_id);

-- 4. ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS public.assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_date BIGINT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  estimated_hours NUMERIC,
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_assignments_user_due ON public.assignments(user_id, due_date);

-- 5. CALENDAR EVENTS (Lectures, Labs & Exams)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT,
  event_type TEXT NOT NULL DEFAULT 'lecture' CHECK (event_type IN ('lecture', 'lab', 'exam', 'study', 'deadline', 'extracurricular', 'personal')),
  start_time BIGINT NOT NULL,
  end_time BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_calendar_user_time ON public.calendar_events(user_id, start_time, end_time);

-- 6. STUDY SESSIONS
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  planned_start_time BIGINT NOT NULL,
  planned_end_time BIGINT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON public.study_sessions(user_id, planned_start_time);

-- 7. STUDY RESOURCES (Notes, Syllabus, PDFs, Links)
CREATE TABLE IF NOT EXISTS public.study_resources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'link' CHECK (resource_type IN ('link', 'note', 'reference', 'document', 'other')),
  url TEXT,
  file_path TEXT,
  file_size INTEGER,
  description TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_study_resources_user ON public.study_resources(user_id);

-- 8. STUDY PLANS (AI & Deterministic Plans)
CREATE TABLE IF NOT EXISTS public.study_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  start_date BIGINT NOT NULL,
  end_date BIGINT NOT NULL,
  allocated_hours NUMERIC NOT NULL DEFAULT 0,
  target_completion INTEGER NOT NULL DEFAULT 0,
  ai_explanation JSONB,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_study_plans_user ON public.study_plans(user_id, status);

-- 9. STUDY PLAN ITEMS
CREATE TABLE IF NOT EXISTS public.study_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES public.assignments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  planned_date BIGINT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  priority TEXT NOT NULL DEFAULT 'medium',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON public.study_plan_items(plan_id, planned_date);

-- 10. LIVE COMMUTE DISRUPTION REPORTS
CREATE TABLE IF NOT EXISTS public.live_commute_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  route_id TEXT,
  corridor TEXT,
  stop_id TEXT,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  crowd_level TEXT NOT NULL DEFAULT 'medium' CHECK (crowd_level IN ('low', 'medium', 'high', 'crush')),
  description TEXT NOT NULL,
  pseudonym TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_reports_expires ON public.live_commute_reports(expires_at);

-- 11. LIVE REPORT CONFIRMATIONS
CREATE TABLE IF NOT EXISTS public.live_report_confirmations (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES public.live_commute_reports(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  confirmation_type TEXT NOT NULL CHECK (confirmation_type IN ('upvote', 'downvote', 'confirm', 'dispute')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_user_report_confirm UNIQUE (report_id, user_id)
);

-- 12. RIDE / TRAVEL TOGETHER GROUPS
CREATE TABLE IF NOT EXISTS public.ride_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'departed', 'cancelled')),
  created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 13. RIDE GROUP MEMBERS
CREATE TABLE IF NOT EXISTS public.ride_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.ride_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  joined_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_group_member UNIQUE (group_id, user_id)
);

-- 14. STUDENT COMMUNITY GOALS
CREATE TABLE IF NOT EXISTS public.goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  category TEXT DEFAULT 'academic',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);

-- 15. SAVED COMMUTE ROUTES
CREATE TABLE IF NOT EXISTS public.saved_routes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  route_data JSONB NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON public.saved_routes(user_id);

-- 16. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'alert')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);

-- 17. FEEDBACK
CREATE TABLE IF NOT EXISTS public.feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Threat model: the backend talks to Postgres with the service_role key (which
-- bypasses RLS). Everything below protects against the *other* credentials: the
-- public anon key shipped to browsers and signed-in "authenticated" Supabase
-- users querying the REST/GraphQL API directly. Default is deny: RLS is enabled
-- on every table, and anon gets no table privileges at all.
--
-- Identity: application ids are TEXT ('usr-...'), not Supabase auth UUIDs. The
-- backend links the two by storing the app id in the Supabase user's
-- *app_metadata* (writable only with the service role, never by the user), so
-- the policies can trust it. user_metadata is client-editable and is NOT used.
-- This script is idempotent: it can be re-run safely.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'app_user_id', ''),
    auth.uid()::text
  )
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_commute_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_report_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- No table privileges for the anonymous (public key) role, anywhere.
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.student_profiles FROM anon;
REVOKE ALL ON public.courses FROM anon;
REVOKE ALL ON public.assignments FROM anon;
REVOKE ALL ON public.calendar_events FROM anon;
REVOKE ALL ON public.study_sessions FROM anon;
REVOKE ALL ON public.study_resources FROM anon;
REVOKE ALL ON public.study_plans FROM anon;
REVOKE ALL ON public.study_plan_items FROM anon;
REVOKE ALL ON public.goals FROM anon;
REVOKE ALL ON public.saved_routes FROM anon;
REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.live_commute_reports FROM anon;
REVOKE ALL ON public.live_report_confirmations FROM anon;
REVOKE ALL ON public.ride_groups FROM anon;
REVOKE ALL ON public.ride_group_members FROM anon;
REVOKE ALL ON public.feedback FROM anon;

-- Backend: full access (documented explicitly; service_role also bypasses RLS).
DROP POLICY IF EXISTS service_role_all_users ON public.users;
CREATE POLICY service_role_all_users ON public.users TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_student_profiles ON public.student_profiles;
CREATE POLICY service_role_all_student_profiles ON public.student_profiles TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_courses ON public.courses;
CREATE POLICY service_role_all_courses ON public.courses TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_assignments ON public.assignments;
CREATE POLICY service_role_all_assignments ON public.assignments TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_calendar_events ON public.calendar_events;
CREATE POLICY service_role_all_calendar_events ON public.calendar_events TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_study_sessions ON public.study_sessions;
CREATE POLICY service_role_all_study_sessions ON public.study_sessions TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_study_resources ON public.study_resources;
CREATE POLICY service_role_all_study_resources ON public.study_resources TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_study_plans ON public.study_plans;
CREATE POLICY service_role_all_study_plans ON public.study_plans TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_study_plan_items ON public.study_plan_items;
CREATE POLICY service_role_all_study_plan_items ON public.study_plan_items TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_goals ON public.goals;
CREATE POLICY service_role_all_goals ON public.goals TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_saved_routes ON public.saved_routes;
CREATE POLICY service_role_all_saved_routes ON public.saved_routes TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_notifications ON public.notifications;
CREATE POLICY service_role_all_notifications ON public.notifications TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_live_commute_reports ON public.live_commute_reports;
CREATE POLICY service_role_all_live_commute_reports ON public.live_commute_reports TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_live_report_confirmations ON public.live_report_confirmations;
CREATE POLICY service_role_all_live_report_confirmations ON public.live_report_confirmations TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_ride_groups ON public.ride_groups;
CREATE POLICY service_role_all_ride_groups ON public.ride_groups TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_ride_group_members ON public.ride_group_members;
CREATE POLICY service_role_all_ride_group_members ON public.ride_group_members TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all_feedback ON public.feedback;
CREATE POLICY service_role_all_feedback ON public.feedback TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- users: a signed-in user can read and edit only their own row, and only the
-- display columns. password_hash is unreachable; role and email are immutable.
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.users FROM authenticated;
GRANT SELECT (id, email, full_name, college_name, profile_picture, role, created_at, updated_at)
  ON public.users TO authenticated;
GRANT UPDATE (full_name, college_name, profile_picture)
  ON public.users TO authenticated;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT public.current_app_user_id()))
  WITH CHECK (id = (SELECT public.current_app_user_id()));
-- No INSERT/DELETE policy: accounts are created and removed only by the backend.

-- -----------------------------------------------------------------------------
-- Rows owned by one student: SELECT / INSERT / UPDATE / DELETE only where
-- user_id is the caller. Covers student_profiles, saved_routes (commute plans),
-- study_plans, courses, assignments, calendar, goals, notifications, ...
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.student_profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_profiles TO authenticated;
DROP POLICY IF EXISTS student_profiles_select_own ON public.student_profiles;
CREATE POLICY student_profiles_select_own ON public.student_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS student_profiles_insert_own ON public.student_profiles;
CREATE POLICY student_profiles_insert_own ON public.student_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS student_profiles_update_own ON public.student_profiles;
CREATE POLICY student_profiles_update_own ON public.student_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS student_profiles_delete_own ON public.student_profiles;
CREATE POLICY student_profiles_delete_own ON public.student_profiles FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.courses FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
DROP POLICY IF EXISTS courses_select_own ON public.courses;
CREATE POLICY courses_select_own ON public.courses FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS courses_insert_own ON public.courses;
CREATE POLICY courses_insert_own ON public.courses FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS courses_update_own ON public.courses;
CREATE POLICY courses_update_own ON public.courses FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS courses_delete_own ON public.courses;
CREATE POLICY courses_delete_own ON public.courses FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.assignments FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
DROP POLICY IF EXISTS assignments_select_own ON public.assignments;
CREATE POLICY assignments_select_own ON public.assignments FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS assignments_insert_own ON public.assignments;
CREATE POLICY assignments_insert_own ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS assignments_update_own ON public.assignments;
CREATE POLICY assignments_update_own ON public.assignments FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS assignments_delete_own ON public.assignments;
CREATE POLICY assignments_delete_own ON public.assignments FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.calendar_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
DROP POLICY IF EXISTS calendar_events_select_own ON public.calendar_events;
CREATE POLICY calendar_events_select_own ON public.calendar_events FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS calendar_events_insert_own ON public.calendar_events;
CREATE POLICY calendar_events_insert_own ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS calendar_events_update_own ON public.calendar_events;
CREATE POLICY calendar_events_update_own ON public.calendar_events FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS calendar_events_delete_own ON public.calendar_events;
CREATE POLICY calendar_events_delete_own ON public.calendar_events FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.study_sessions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
DROP POLICY IF EXISTS study_sessions_select_own ON public.study_sessions;
CREATE POLICY study_sessions_select_own ON public.study_sessions FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_sessions_insert_own ON public.study_sessions;
CREATE POLICY study_sessions_insert_own ON public.study_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_sessions_update_own ON public.study_sessions;
CREATE POLICY study_sessions_update_own ON public.study_sessions FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_sessions_delete_own ON public.study_sessions;
CREATE POLICY study_sessions_delete_own ON public.study_sessions FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.study_resources FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_resources TO authenticated;
DROP POLICY IF EXISTS study_resources_select_own ON public.study_resources;
CREATE POLICY study_resources_select_own ON public.study_resources FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_resources_insert_own ON public.study_resources;
CREATE POLICY study_resources_insert_own ON public.study_resources FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_resources_update_own ON public.study_resources;
CREATE POLICY study_resources_update_own ON public.study_resources FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_resources_delete_own ON public.study_resources;
CREATE POLICY study_resources_delete_own ON public.study_resources FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.study_plans FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plans TO authenticated;
DROP POLICY IF EXISTS study_plans_select_own ON public.study_plans;
CREATE POLICY study_plans_select_own ON public.study_plans FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_plans_insert_own ON public.study_plans;
CREATE POLICY study_plans_insert_own ON public.study_plans FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_plans_update_own ON public.study_plans;
CREATE POLICY study_plans_update_own ON public.study_plans FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_plans_delete_own ON public.study_plans;
CREATE POLICY study_plans_delete_own ON public.study_plans FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.study_plan_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_items TO authenticated;
DROP POLICY IF EXISTS study_plan_items_select_own ON public.study_plan_items;
CREATE POLICY study_plan_items_select_own ON public.study_plan_items FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_plan_items_insert_own ON public.study_plan_items;
CREATE POLICY study_plan_items_insert_own ON public.study_plan_items FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_plan_items_update_own ON public.study_plan_items;
CREATE POLICY study_plan_items_update_own ON public.study_plan_items FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS study_plan_items_delete_own ON public.study_plan_items;
CREATE POLICY study_plan_items_delete_own ON public.study_plan_items FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.goals FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
DROP POLICY IF EXISTS goals_select_own ON public.goals;
CREATE POLICY goals_select_own ON public.goals FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS goals_insert_own ON public.goals;
CREATE POLICY goals_insert_own ON public.goals FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS goals_update_own ON public.goals;
CREATE POLICY goals_update_own ON public.goals FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS goals_delete_own ON public.goals;
CREATE POLICY goals_delete_own ON public.goals FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.saved_routes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_routes TO authenticated;
DROP POLICY IF EXISTS saved_routes_select_own ON public.saved_routes;
CREATE POLICY saved_routes_select_own ON public.saved_routes FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS saved_routes_insert_own ON public.saved_routes;
CREATE POLICY saved_routes_insert_own ON public.saved_routes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS saved_routes_update_own ON public.saved_routes;
CREATE POLICY saved_routes_update_own ON public.saved_routes FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS saved_routes_delete_own ON public.saved_routes;
CREATE POLICY saved_routes_delete_own ON public.saved_routes FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.notifications FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

-- -----------------------------------------------------------------------------
-- Community content (reports, ride groups): readable by signed-in students,
-- writable only by the creator. Anonymous visitors read these through the
-- backend API (which strips internal ids), not directly from the database.
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.live_commute_reports FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_commute_reports TO authenticated;
DROP POLICY IF EXISTS reports_select ON public.live_commute_reports;
CREATE POLICY reports_select ON public.live_commute_reports FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS reports_insert_own ON public.live_commute_reports;
CREATE POLICY reports_insert_own ON public.live_commute_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS reports_update_own ON public.live_commute_reports;
CREATE POLICY reports_update_own ON public.live_commute_reports FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS reports_delete_own ON public.live_commute_reports;
CREATE POLICY reports_delete_own ON public.live_commute_reports FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

REVOKE ALL ON public.ride_groups FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_groups TO authenticated;
DROP POLICY IF EXISTS ride_groups_select ON public.ride_groups;
CREATE POLICY ride_groups_select ON public.ride_groups FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS ride_groups_insert_own ON public.ride_groups;
CREATE POLICY ride_groups_insert_own ON public.ride_groups FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS ride_groups_update_own ON public.ride_groups;
CREATE POLICY ride_groups_update_own ON public.ride_groups FOR UPDATE TO authenticated
  USING (created_by = (SELECT public.current_app_user_id()))
  WITH CHECK (created_by = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS ride_groups_delete_own ON public.ride_groups;
CREATE POLICY ride_groups_delete_own ON public.ride_groups FOR DELETE TO authenticated
  USING (created_by = (SELECT public.current_app_user_id()));

-- Membership: a student sees and manages only their own membership rows.

REVOKE ALL ON public.ride_group_members FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_group_members TO authenticated;
DROP POLICY IF EXISTS ride_members_select ON public.ride_group_members;
CREATE POLICY ride_members_select ON public.ride_group_members FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS ride_members_insert_own ON public.ride_group_members;
CREATE POLICY ride_members_insert_own ON public.ride_group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS ride_members_update_own ON public.ride_group_members;
CREATE POLICY ride_members_update_own ON public.ride_group_members FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS ride_members_delete_own ON public.ride_group_members;
CREATE POLICY ride_members_delete_own ON public.ride_group_members FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

-- Confirmations: own rows only; a confirmation is never edited, only added/removed.
REVOKE ALL ON public.live_report_confirmations FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_report_confirmations TO authenticated;
DROP POLICY IF EXISTS confirmations_select_own ON public.live_report_confirmations;
CREATE POLICY confirmations_select_own ON public.live_report_confirmations FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS confirmations_insert_own ON public.live_report_confirmations;
CREATE POLICY confirmations_insert_own ON public.live_report_confirmations FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS confirmations_delete_own ON public.live_report_confirmations;
CREATE POLICY confirmations_delete_own ON public.live_report_confirmations FOR DELETE TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));

-- Feedback: students can submit and read back their own entries; never edit or delete.
REVOKE ALL ON public.feedback FROM authenticated;
GRANT SELECT, INSERT ON public.feedback TO authenticated;
DROP POLICY IF EXISTS feedback_select_own ON public.feedback;
CREATE POLICY feedback_select_own ON public.feedback FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));

-- Indexes that keep the ownership predicates fast.
CREATE INDEX IF NOT EXISTS idx_reports_user ON public.live_commute_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ride_groups_created_by ON public.ride_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_ride_members_user ON public.ride_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
