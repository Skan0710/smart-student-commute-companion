import React, { useEffect } from 'react';
import {
  GraduationCap,
  Compass,
  Users,
  Target,
  Calendar,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react';
import { loadAcademicSnapshot } from '../services/academics';
import { loadCommunitySnapshot } from '../services/communityGoals';
import { readAuthSession } from '../utils/authSession';
import { formatStatus } from '../utils/formatters';
import useAsyncResource from '../hooks/useAsyncResource';
import { Alert, Button, SampleDataBanner } from '../components/ui';

const CARD_SURFACE =
  'bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.12)] dark:shadow-none';

const STAT_ACCENTS = {
  blue: {
    chip: 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
    link: 'text-blue-700 dark:text-blue-400',
    hover: 'hover:border-blue-400 dark:hover:border-blue-500',
  },
  indigo: {
    chip: 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400',
    link: 'text-indigo-700 dark:text-indigo-400',
    hover: 'hover:border-indigo-400 dark:hover:border-indigo-500',
  },
  emerald: {
    chip: 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
    link: 'text-emerald-700 dark:text-emerald-400',
    hover: 'hover:border-emerald-400 dark:hover:border-emerald-500',
  },
  violet: {
    chip: 'bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400',
    link: 'text-violet-700 dark:text-violet-400',
    hover: 'hover:border-violet-400 dark:hover:border-violet-500',
  },
};

/** Clickable summary tile (a real button, so it is keyboard reachable). */
function StatCard({ accent, icon: Icon, label, value, caption, action, onClick }) {
  const styles = STAT_ACCENTS[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left p-4 sm:p-5 rounded-2xl ${CARD_SURFACE} ${styles.hover} hover:-translate-y-0.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">{label}</span>
        <span className={`p-2 rounded-xl ${styles.chip}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">{value}</span>
        <span className="text-xs text-slate-600 dark:text-slate-400">{caption}</span>
      </div>
      <div className={`mt-2 text-xs ${styles.link} font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1`}>
        <span>{action}</span>
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </div>
    </button>
  );
}

/** Titled card with an icon chip and a text action. */
function Panel({ icon: Icon, chipClass, title, action, onAction, actionClass, trailing, children }) {
  return (
    <section className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4`} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 ${chipClass}`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        </div>
        {trailing || (
          action && (
            <button
              type="button"
              onClick={onAction}
              className={`shrink-0 text-xs font-semibold hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${actionClass}`}
            >
              {action}
            </button>
          )
        )}
      </div>
      {children}
    </section>
  );
}

function RowSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-[58px] rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

function EmptyNote({ children }) {
  return (
    <p className="text-sm text-slate-600 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5">
      {children}
    </p>
  );
}

/**
 * MainDashboardPage
 *
 * Provides a unified overview of the student platform:
 * - Academic schedule & current courses
 * - AI study plan & productivity milestones
 * - Quick route planning & live disruptions
 * - Goals & shared peer travel
 *
 * Signed-in students see their own data; guests see labelled sample data.
 */
export default function MainDashboardPage({ onNavigate, reportsCount = 0 }) {
  const academic = useAsyncResource(loadAcademicSnapshot, {
    errorMessage: 'Unable to load your academic summary. Please check your connection and try again.',
  });
  const community = useAsyncResource(loadCommunitySnapshot, {
    errorMessage: 'Unable to load your goals and shared travel. Please check your connection and try again.',
  });

  useEffect(() => {
    academic.load();
    community.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadError = academic.loadError || community.loadError;
  const retryAll = () => {
    academic.load();
    community.load();
  };

  const courses = academic.data?.courses || [];
  const assignments = academic.data?.assignments || [];
  const schedule = academic.data?.events || [];
  const plan = academic.data?.plan || null;
  const goals = community.data?.goals || [];
  const journeyCount = community.data?.journeyCount ?? 0;
  const isSample = Boolean(academic.data?.isSample || community.data?.isSample);

  const pendingAssignments = assignments.filter(
    (assignment) => assignment.status !== 'completed' && assignment.status !== 'cancelled'
  );
  const nextDue = pendingAssignments[0];

  const academicLoading = academic.isLoading;
  const communityLoading = community.isLoading;
  const show = (loading, value) => (loading ? '—' : value);

  const firstName = (readAuthSession()?.user?.full_name || '').trim().split(/\s+/)[0];

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-8 font-sans">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 dark:from-indigo-950 dark:via-slate-900 dark:to-blue-950 text-white p-6 sm:p-10 shadow-2xl shadow-indigo-600/20 border border-white/10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 w-80 h-80 rounded-full bg-white/10 blur-3xl"></div>
        <div aria-hidden="true" className="pointer-events-none absolute right-24 -bottom-32 w-72 h-72 rounded-full bg-sky-400/20 blur-3xl"></div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]"></div>
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-blue-50">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            <span>{firstName ? `Welcome back, ${firstName}` : 'Welcome to Smart Student Companion'}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-display font-bold tracking-tight text-white leading-[1.1]">
            Your Complete Student Platform
          </h1>
          <p className="text-sm sm:text-base text-blue-50 dark:text-slate-300 font-normal leading-relaxed">
            Everything you need for Mumbai student life: real-time campus commute routing, class schedules, AI study planners, and collaborative student travel.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate?.('planner')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-blue-700 font-bold text-xs sm:text-sm shadow-md hover:bg-blue-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
            >
              <Compass className="w-4 h-4" aria-hidden="true" />
              <span>Plan Today's Commute</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('academics')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs sm:text-sm active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
            >
              <GraduationCap className="w-4 h-4" aria-hidden="true" />
              <span>View Academics Hub</span>
            </button>
          </div>
        </div>
      </div>

      {isSample && !academicLoading && (
        <SampleDataBanner onSignIn={() => onNavigate?.('account')} what="courses, plan, goals and journeys" />
      )}

      {loadError && (
        <Alert variant="warning" title="Some of your dashboard couldn't be loaded">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="secondary" onClick={retryAll}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Overview quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          accent="blue"
          icon={GraduationCap}
          label="Enrolled Courses"
          value={show(academicLoading, courses.length)}
          caption="this semester"
          action="Manage courses & resources"
          onClick={() => onNavigate?.('academics')}
        />
        <StatCard
          accent="indigo"
          icon={Clock}
          label="Assignments Due"
          value={show(academicLoading, pendingAssignments.length)}
          caption={nextDue ? `next: ${nextDue.dueDate}` : 'nothing pending'}
          action="View task deadlines"
          onClick={() => onNavigate?.('academics')}
        />
        <StatCard
          accent="emerald"
          icon={Zap}
          label="AI Study Plan"
          value={show(academicLoading, Number.isFinite(plan?.targetCompletion) ? `${plan.targetCompletion}%` : '—')}
          caption={plan ? 'of this week done' : 'no plan yet'}
          action="Check scheduled sessions"
          onClick={() => onNavigate?.('academics')}
        />
        <StatCard
          accent="violet"
          icon={Users}
          label="Student Travel Pools"
          value={show(communityLoading, journeyCount)}
          caption={journeyCount === 1 ? 'active journey' : 'active journeys'}
          action="Join or coordinate journeys"
          onClick={() => onNavigate?.('community')}
        />
      </div>

      {/* Middle Grid: Today's Schedule & Study Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          icon={Calendar}
          chipClass="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          title="Today's Schedule & Lectures"
          action="Full Calendar"
          onAction={() => onNavigate?.('academics')}
          actionClass="text-blue-700 dark:text-blue-400"
        >
          {academicLoading ? (
            <RowSkeleton />
          ) : schedule.length === 0 ? (
            <EmptyNote>No classes or events scheduled for today.</EmptyNote>
          ) : (
            <ul className="space-y-3 pt-1 list-none">
              {schedule.slice(0, 3).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{item.title}</div>
                    {item.location && (
                      <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden="true"></span>
                        <span>{item.location}</span>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                    {item.time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={Zap}
          chipClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
          title="AI Study Plan & Focus Tasks"
          trailing={
            plan ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                {formatStatus(plan.status)} plan
              </span>
            ) : null
          }
          action={plan ? null : 'Open Academics'}
          onAction={() => onNavigate?.('academics')}
          actionClass="text-emerald-700 dark:text-emerald-400"
        >
          {academicLoading ? (
            <RowSkeleton />
          ) : !plan || plan.items.length === 0 ? (
            <EmptyNote>No study plan yet. Generate one from your assignments and goals in Academics.</EmptyNote>
          ) : (
            <ul className="space-y-3 pt-1 list-none">
              {plan.items.slice(0, 3).map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${task.status === 'completed' ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-600'}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{task.title}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {[task.day, task.duration].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                    task.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}>
                    {formatStatus(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Bottom Grid: Commute Overview & Active Student Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          icon={Compass}
          chipClass="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          title="Transit & Route Planner"
          action="Open Full Planner"
          onAction={() => onNavigate?.('planner')}
          actionClass="text-blue-700 dark:text-blue-400"
        >
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/60 border border-blue-100 dark:border-slate-700/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Real-Time Live Transit Alerts
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300">
                {reportsCount} Active {reportsCount === 1 ? 'Disruption' : 'Disruptions'}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Western Line local trains, Metro Line 1 &amp; 2A/7 delays, reported and confirmed by fellow students.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onNavigate?.('planner')}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
              >
                Find Best Multimodal Route to College
              </button>
            </div>
          </div>
        </Panel>

        <Panel
          icon={Target}
          chipClass="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
          title="Student Goals & Milestones"
          action="View All Goals"
          onAction={() => onNavigate?.('community')}
          actionClass="text-violet-700 dark:text-violet-400"
        >
          {communityLoading ? (
            <RowSkeleton rows={2} />
          ) : goals.length === 0 ? (
            <EmptyNote>No goals yet. Set your first milestone in Community &amp; Goals.</EmptyNote>
          ) : (
            <ul className="space-y-3 pt-1 list-none">
              {goals.slice(0, 2).map((goal) => (
                <li
                  key={goal.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{goal.title}</span>
                    <span className="text-xs font-bold text-violet-700 dark:text-violet-400 tabular-nums">{goal.progress}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Progress for ${goal.title}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={goal.progress}
                    className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                  >
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 flex justify-between gap-3">
                    <span>{goal.category ? `Category: ${goal.category}` : formatStatus(goal.status)}</span>
                    <span>Target: {goal.targetDate}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
