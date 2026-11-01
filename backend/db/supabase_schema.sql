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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures data security when querying Supabase with user tokens or anon keys
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_commute_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_report_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Allow service_role key full unrestricted access for backend server queries
CREATE POLICY service_role_all_users ON public.users TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_profiles ON public.student_profiles TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_courses ON public.courses TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_assignments ON public.assignments TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_calendar ON public.calendar_events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_sessions ON public.study_sessions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_resources ON public.study_resources TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_plans ON public.study_plans TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_plan_items ON public.study_plan_items TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_reports ON public.live_commute_reports TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_confirmations ON public.live_report_confirmations TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_ride_groups ON public.ride_groups TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_ride_members ON public.ride_group_members TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_goals ON public.goals TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_routes ON public.saved_routes TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notifications ON public.notifications TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_feedback ON public.feedback TO service_role USING (true) WITH CHECK (true);

-- Public read access for live commute reports & ride groups
CREATE POLICY public_read_reports ON public.live_commute_reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_read_ride_groups ON public.ride_groups FOR SELECT TO anon, authenticated USING (true);

