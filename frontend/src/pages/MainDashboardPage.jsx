import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  Compass,
  Users,
  Target,
  Calendar,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Zap,
  Download,
  Share2,
  Radio,
} from 'lucide-react';
import { loadAcademicSnapshot } from '../services/academics';
import { loadCommunitySnapshot } from '../services/communityGoals';
import { readAuthSession } from '../utils/authSession';
import { formatStatus } from '../utils/formatters';
import { annotateSchedule, greetingForHour } from '../utils/schedule';
import useAsyncResource from '../hooks/useAsyncResource';
import useCountUp from '../hooks/useCountUp';
import { Alert, Button, SampleDataBanner } from '../components/ui';

const CARD_SURFACE =
  'bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-white/20 shadow-[0_1px_3px_rgba(31,36,33,0.06),0_12px_32px_-14px_rgba(31,36,33,0.12)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f5f0] dark:focus-visible:ring-offset-[#070b18]';

const STAT_ACCENTS = {
  blue: {
    chip: 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
    link: 'text-blue-700 dark:text-blue-400',
    hover: 'hover:border-blue-400 dark:hover:border-blue-500',
  },
  burgundy: {
    chip: 'bg-[#800020]/10 dark:bg-[#0047ff]/20 text-[#800020] dark:text-[#ccff00]',
    link: 'text-[#800020] dark:text-[#ccff00]',
    hover: 'hover:border-[#800020]/40 dark:hover:border-[#0047ff]/50',
  },
  emerald: {
    chip: 'bg-emerald-50 dark:bg-emerald-900/40 text-[#586953] dark:text-emerald-400',
    link: 'text-[#586953] dark:text-emerald-400',
    hover: 'hover:border-[#586953]/40 dark:hover:border-emerald-500',
  },
  sage: {
    chip: 'bg-[#586953]/10 dark:bg-emerald-950/40 text-[#586953] dark:text-emerald-300',
    link: 'text-[#586953] dark:text-emerald-300',
    hover: 'hover:border-[#586953]/40 dark:hover:border-emerald-500',
  },
};

/** Circular progress that fills in after mount. Purely visual; the number sits beside it. */
function ProgressRing({ value, className = '' }) {
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(Math.max(0, Math.min(100, value))));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 44 44" className={`w-11 h-11 -rotate-90 ${className}`} aria-hidden="true">
      <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4.5" className="stroke-slate-200 dark:stroke-white/15" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        strokeWidth="4.5"
        strokeLinecap="round"
        className="stroke-[#586953] dark:stroke-emerald-400"
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: circumference * (1 - filled / 100),
          transition: 'stroke-dashoffset 900ms cubic-bezier(0.2, 0.7, 0.2, 1)',
        }}
      />
    </svg>
  );
}

/** Clickable summary tile (a real button, so it is keyboard reachable). */
function StatCard({ accent, icon: Icon, label, value, suffix = '', caption, action, onClick, ring, index = 0 }) {
  const styles = STAT_ACCENTS[accent];
  const shown = useCountUp(value);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ '--i': index + 2 }}
      className={`rise lift group text-left p-4 sm:p-5 rounded-2xl ${CARD_SURFACE} ${styles.hover} ${FOCUS_RING}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">{label}</span>
        {typeof ring === 'number' ? (
          <ProgressRing value={ring} />
        ) : (
          <span className={`p-2 rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${styles.chip}`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-display font-bold tabular-nums text-slate-900 dark:text-white">
          {shown}
          {typeof shown === 'number' ? suffix : ''}
        </span>
        <span className="text-xs text-slate-600 dark:text-slate-400">{caption}</span>
      </div>
      <div className={`mt-2 text-xs ${styles.link} font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1`}>
        <span>{action}</span>
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </div>
    </button>
  );
}

/** Titled card with an icon chip and a text action. */
function Panel({ icon: Icon, chipClass, title, action, onAction, actionClass, trailing, index = 0, children }) {
  return (
    <section
      style={{ '--i': index + 6 }}
      className={`rise card-glow p-5 sm:p-6 rounded-3xl ${CARD_SURFACE} space-y-4`}
      aria-label={title}
    >
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
              className={`shrink-0 inline-flex items-center gap-1 min-h-9 px-2 -mr-2 text-xs font-semibold rounded-lg hover:underline ${FOCUS_RING} ${actionClass}`}
            >
              {action}
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
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

/** Empty states always offer the next step instead of dead-ending. */
function EmptyNote({ children, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5 space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">{children}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={`inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/20 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-[#800020] dark:hover:border-white active:scale-95 transition-all ${FOCUS_RING}`}
        >
          {actionLabel}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Decorative route line behind the hero: stations joined by a dashed, flowing path. */
function RouteArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 520 220"
      className="pointer-events-none absolute right-0 bottom-0 w-[620px] max-w-none opacity-60 sm:opacity-80"
      fill="none"
    >
      <path
        className="route-flow"
        d="M-10 190 C 90 190, 120 110, 210 110 S 330 170, 400 90 S 480 40, 540 50"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {[
        [210, 110],
        [400, 90],
      ].map(([cx, cy]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="11" fill="rgba(255,255,255,0.15)" />
          <circle cx={cx} cy={cy} r="5.5" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Today briefing: greets the student, says what is next and shows whether the
 * network is currently disrupted. Everything here comes from data already on
 * the page (schedule, live report count); nothing is estimated.
 */
function TodayHero({ firstName, now, upNext, scheduleKnown, reportsCount, onNavigate }) {
  const greeting = greetingForHour(now.getHours());
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const disrupted = reportsCount > 0;

  let briefing;
  if (upNext) {
    briefing = (
      <>
        <span className="font-bold text-white">{upNext.status === 'now' ? 'In session' : 'Up next'}:</span>{' '}
        {upNext.title}
        {upNext.time ? ` · ${upNext.time}` : ''}
        {upNext.location ? ` · ${upNext.location}` : ''}
      </>
    );
  } else if (scheduleKnown) {
    briefing = "You're done with classes for today. Check your study plan or plan tomorrow's commute.";
  } else {
    briefing = 'Plan your route to campus, check live disruptions and keep your study plan on track.';
  }

  return (
    <div className="rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#800020] via-[#5c0017] to-[#38000e] dark:from-[#0047ff] dark:via-[#020d33] dark:to-[#030408] text-white p-6 sm:p-9 shadow-2xl shadow-[#800020]/20 dark:shadow-[#0047ff]/25 border border-white/10 dark:border-[#1e2440]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute right-24 -bottom-32 w-72 h-72 rounded-full bg-sky-400/20 blur-3xl" />
      <RouteArt />

      <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-2xl space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs font-semibold text-white/90">
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
            {dateLabel}
          </p>
          <h1 className="text-3xl sm:text-5xl font-display font-bold tracking-tight text-white leading-[1.1]">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm sm:text-base text-blue-50 dark:text-slate-200 leading-relaxed max-w-xl">{briefing}</p>
          <div className="pt-1 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate?.('planner')}
              className="btn-sheen inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-2xl bg-[#f7f5f0] text-[#800020] dark:bg-[#ccff00] dark:text-black font-extrabold text-sm shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#800020] dark:focus-visible:ring-offset-[#0047ff]"
            >
              <Compass className="w-4 h-4" aria-hidden="true" />
              <span>Plan today&apos;s commute</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('academics')}
              className="hover-lift inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-sm active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#800020] dark:focus-visible:ring-offset-[#0047ff]"
            >
              <GraduationCap className="w-4 h-4" aria-hidden="true" />
              <span>Open Academics</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.('alerts')}
          className="group w-full lg:w-64 text-left rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/25 p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/90">
            <span className={`live-dot ${disrupted ? 'text-amber-300' : 'text-emerald-300'}`} data-still={String(!disrupted)}>
              <i />
            </span>
            Commute pulse
          </span>
          <span className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-display font-bold tabular-nums">{reportsCount}</span>
            <span className="text-sm font-semibold text-white/90">
              {disrupted ? `active ${reportsCount === 1 ? 'report' : 'reports'}` : 'reports, all clear'}
            </span>
          </span>
          <span className="mt-1 block text-xs text-white/90">
            {disrupted ? 'Reported by students on the network.' : 'No disruptions reported by students.'}
          </span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-white group-hover:gap-2 transition-all">
            See live alerts <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}

const TIMELINE_STYLES = {
  now: { dot: 'text-emerald-500', badge: 'In progress', badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  next: { dot: 'text-blue-500', badge: 'Up next', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  later: { dot: 'text-slate-300 dark:text-slate-600', badge: null },
  done: { dot: 'text-slate-300 dark:text-slate-600', badge: 'Done', badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

/** Vertical timeline: the current and next class are emphasised, finished ones recede. */
function ScheduleTimeline({ items }) {
  return (
    <ol className="list-none relative">
      {items.map((item, index) => {
        const style = TIMELINE_STYLES[item.status] || TIMELINE_STYLES.later;
        const emphasised = item.status === 'now' || item.status === 'next';
        const last = index === items.length - 1;
        return (
          <li key={item.id} className={`relative flex gap-3 ${last ? '' : 'pb-3'} ${item.status === 'done' ? 'opacity-60' : ''}`}>
            {!last && <span aria-hidden="true" className="absolute left-[9px] top-5 bottom-0 w-px bg-slate-200 dark:bg-white/15" />}
            <span className="relative mt-3.5 shrink-0">
              <span className={`live-dot ${style.dot}`} data-still={String(item.status !== 'now')} aria-hidden="true">
                <i />
              </span>
            </span>
            <div
              className={`flex-1 min-w-0 flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-colors ${
                emphasised
                  ? 'bg-blue-50/70 dark:bg-blue-500/10 border-blue-200 dark:border-blue-400/40'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-bold tabular-nums text-slate-600 dark:text-slate-400">{item.time}</div>
                <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{item.title}</div>
                {item.location && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{item.location}</span>
                  </div>
                )}
              </div>
              {style.badge && (
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${style.badgeClass}`}>{style.badge}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * MainDashboardPage
 *
 * The student's "today" screen:
 * - A briefing that greets them and says what is next, plus a live commute pulse
 * - Academic and travel numbers that open the relevant screen
 * - Today's schedule as a now/next timeline, the study plan and goals
 *
 * Signed-in students see their own data; guests see labelled sample data.
 */
export default function MainDashboardPage({
  onNavigate,
  reportsCount = 0,
  onInstallApp,
  canInstall = false,
  isInstalled = false,
  onShare,
}) {
  const handleInstall = () => {
    if (onInstallApp) {
      onInstallApp();
    } else {
      onNavigate?.('install');
    }
  };

  const handleShare = () => {
    if (onShare) {
      onShare();
    } else if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'Smart Student Companion',
        text: 'All-in-one student platform for Mumbai academics, commute routes, and peer travel.',
        url: window.location.origin,
      }).catch(() => {});
    } else {
      onNavigate?.('install');
    }
  };
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

  // Keep "in progress / up next" truthful while the page stays open
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
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

  const timeline = useMemo(() => annotateSchedule(schedule, now), [schedule, now]);
  const upNext = timeline.find((item) => item.status === 'now') || timeline.find((item) => item.status === 'next') || null;

  const pendingAssignments = assignments.filter(
    (assignment) => assignment.status !== 'completed' && assignment.status !== 'cancelled'
  );
  const nextDue = pendingAssignments[0];

  const academicLoading = academic.isLoading;
  const communityLoading = community.isLoading;
  const show = (loading, value) => (loading ? '—' : value);

  const firstName = (readAuthSession()?.user?.full_name || '').trim().split(/\s+/)[0];

  const planItems = plan?.items || [];
  const planDone = planItems.filter((task) => task.status === 'completed').length;
  const planPercent = Number.isFinite(plan?.targetCompletion) ? plan.targetCompletion : null;

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-8 font-sans">
      <TodayHero
        firstName={firstName}
        now={now}
        upNext={upNext}
        scheduleKnown={!academicLoading && !isSample && schedule.length > 0}
        reportsCount={reportsCount}
        onNavigate={onNavigate}
      />

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
          index={0}
          accent="blue"
          icon={GraduationCap}
          label="Enrolled Courses"
          value={show(academicLoading, courses.length)}
          caption="this semester"
          action="Manage courses & resources"
          onClick={() => onNavigate?.('academics')}
        />
        <StatCard
          index={1}
          accent="burgundy"
          icon={Clock}
          label="Assignments Due"
          value={show(academicLoading, pendingAssignments.length)}
          caption={nextDue ? `next: ${nextDue.dueDate}` : 'nothing pending'}
          action="View task deadlines"
          onClick={() => onNavigate?.('academics')}
        />
        <StatCard
          index={2}
          accent="emerald"
          icon={Zap}
          label="Study Plan"
          value={show(academicLoading, planPercent !== null ? planPercent : '—')}
          suffix={planPercent !== null ? '%' : ''}
          ring={!academicLoading && planPercent !== null ? planPercent : undefined}
          caption={plan ? 'of this week done' : 'no plan yet'}
          action="Check scheduled sessions"
          onClick={() => onNavigate?.('academics')}
        />
        <StatCard
          index={3}
          accent="sage"
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
          index={0}
          icon={Calendar}
          chipClass="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          title="Today's Schedule & Lectures"
          action="Full Calendar"
          onAction={() => onNavigate?.('academics')}
          actionClass="text-blue-700 dark:text-blue-400"
        >
          {academicLoading ? (
            <RowSkeleton />
          ) : timeline.length === 0 ? (
            <EmptyNote actionLabel="Add your timetable" onAction={() => onNavigate?.('academics')}>
              No classes or events scheduled for today. Scan or add your timetable and your day will show up here.
            </EmptyNote>
          ) : (
            <ScheduleTimeline items={timeline.slice(0, 4)} />
          )}
        </Panel>

        <Panel
          index={1}
          icon={Zap}
          chipClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
          title="Study Plan & Focus Tasks"
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
          ) : !plan || planItems.length === 0 ? (
            <EmptyNote actionLabel="Build a study plan" onAction={() => onNavigate?.('academics')}>
              No study plan yet. Generate one from your assignments and goals in Academics.
            </EmptyNote>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-label="Study tasks completed"
                  aria-valuemin={0}
                  aria-valuemax={planItems.length}
                  aria-valuenow={planDone}
                  className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                >
                  <div
                    className="bar-grow h-full rounded-full bg-gradient-to-r from-emerald-500 to-[#586953] dark:from-emerald-400 dark:to-[#ccff00]"
                    style={{ width: `${(planDone / planItems.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300">
                  {planDone}/{planItems.length} done
                </span>
              </div>
              <ul className="space-y-3 list-none">
                {planItems.slice(0, 3).map((task) => {
                  const completed = task.status === 'completed';
                  const StatusIcon = completed ? CheckCircle2 : Circle;
                  return (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusIcon
                          className={`w-4 h-4 shrink-0 ${completed ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className={`font-semibold text-sm text-slate-900 dark:text-slate-100 ${completed ? 'line-through decoration-slate-400' : ''}`}>
                            {task.title}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {[task.day, task.duration].filter(Boolean).join(' • ')}
                          </div>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                        completed
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {formatStatus(task.status)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* Bottom Grid: Commute Overview & Active Student Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          index={2}
          icon={Compass}
          chipClass="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
          title="Transit & Route Planner"
          action="Open Full Planner"
          onAction={() => onNavigate?.('planner')}
          actionClass="text-blue-700 dark:text-blue-400"
        >
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-sky-50 dark:from-slate-800 dark:to-slate-800/60 border border-blue-100 dark:border-slate-700/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                Live transit alerts
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                reportsCount > 0
                  ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
              }`}>
                {reportsCount > 0
                  ? `${reportsCount} active ${reportsCount === 1 ? 'disruption' : 'disruptions'}`
                  : 'No disruptions reported'}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Western Line local trains, Metro Line 1 &amp; 2A/7 delays, reported and confirmed by fellow students.
            </p>
            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => onNavigate?.('planner')}
                className={`btn-sheen flex-1 py-2.5 px-4 min-h-[44px] rounded-xl bg-[#800020] hover:bg-[#68001a] text-white dark:bg-[#0047ff] dark:hover:bg-[#1e5cff] font-bold text-xs shadow-sm active:scale-[0.98] transition-all ${FOCUS_RING}`}
              >
                Find the best route to college
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.('alerts')}
                className={`py-2.5 px-4 min-h-[44px] rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/20 text-slate-800 dark:text-slate-100 font-bold text-xs hover:border-[#800020] dark:hover:border-white active:scale-[0.98] transition-all ${FOCUS_RING}`}
              >
                View alerts
              </button>
            </div>
          </div>
        </Panel>

        <Panel
          index={3}
          icon={Target}
          chipClass="bg-[#800020]/10 dark:bg-[#0047ff]/20 text-[#800020] dark:text-[#ccff00]"
          title="Student Goals & Milestones"
          action="View All Goals"
          onAction={() => onNavigate?.('community')}
          actionClass="text-[#800020] dark:text-[#ccff00]"
        >
          {communityLoading ? (
            <RowSkeleton rows={2} />
          ) : goals.length === 0 ? (
            <EmptyNote actionLabel="Set a first goal" onAction={() => onNavigate?.('community')}>
              No goals yet. Set your first milestone in Community &amp; Goals.
            </EmptyNote>
          ) : (
            <ul className="space-y-3 pt-1 list-none">
              {goals.slice(0, 2).map((goal) => (
                <li
                  key={goal.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{goal.title}</span>
                    <span className="text-xs font-bold text-[#800020] dark:text-[#ccff00] tabular-nums">{goal.progress}%</span>
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
                      className="bar-grow h-full bg-gradient-to-r from-[#800020] to-[#586953] dark:from-[#0047ff] dark:to-[#ccff00] rounded-full"
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

      {/* Install and Share - Last line on Dashboard */}
      <div className="pt-6 border-t border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Download className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white block sm:inline">Install Smart Student Companion</span>
            <span className="hidden sm:inline text-slate-400 dark:text-slate-500 mx-1.5">•</span>
            <span className="text-slate-500 dark:text-slate-400">Install to your home screen or share with classmates</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleInstall}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-[#800020] hover:bg-[#68001a] text-white dark:bg-[#0047ff] dark:hover:bg-[#1e5cff] font-semibold text-xs shadow-sm active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] dark:focus-visible:ring-[#0047ff]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isInstalled ? 'Installed App' : 'Install App'}</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-slate-200 font-semibold text-xs active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  );
}
