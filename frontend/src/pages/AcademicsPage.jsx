import React, { useEffect, useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  Calendar,
  Zap,
  FileText,
  Clock,
  CheckCircle2,
  Plus,
  ExternalLink,
  Sparkles,
  Link2
} from 'lucide-react';
import {
  loadAcademicHub,
  getCurrentStudyPlan,
  generateStudyPlan,
  createCourse,
  createAssignment,
  createCalendarEvent,
  createStudyResource
} from '../services/academics';
import useAsyncResource from '../hooks/useAsyncResource';
import { formatStatus } from '../utils/formatters';
import {
  Tabs,
  TabPanel,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SampleDataBanner,
  EntityFormModal
} from '../components/ui';

const CARD_SURFACE =
  'bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.12)] dark:shadow-none';

const ASSIGNMENT_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const EVENT_TYPES = [
  { value: 'lecture', label: 'Lecture' },
  { value: 'lab', label: 'Lab' },
  { value: 'exam', label: 'Exam' },
  { value: 'study', label: 'Study' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'extracurricular', label: 'Extracurricular' },
  { value: 'personal', label: 'Personal' },
];

const RESOURCE_TYPES = [
  { value: 'link', label: 'Link' },
  { value: 'note', label: 'Note' },
  { value: 'reference', label: 'Reference' },
  { value: 'document', label: 'Document' },
  { value: 'other', label: 'Other' },
];

const pad = (n) => String(n).padStart(2, '0');

/** Value for <input type="datetime-local"> / <input type="date"> in the student's local time. */
const toLocalInput = (date, withTime = true) => {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
};

const tomorrowAt = (hours, minutes) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const ASSIGNMENT_STATUS_STYLES = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  overdue: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  default: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

function assignmentBadge(assignment) {
  const isOpen = assignment.status !== 'completed' && assignment.status !== 'cancelled';
  if (isOpen && Number.isFinite(assignment.dueAt) && assignment.dueAt < Date.now()) {
    return { label: 'Overdue', className: ASSIGNMENT_STATUS_STYLES.overdue };
  }
  return {
    label: formatStatus(assignment.status),
    className: ASSIGNMENT_STATUS_STYLES[assignment.status] || ASSIGNMENT_STATUS_STYLES.default,
  };
}

function AddButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
    >
      <Plus className="w-4 h-4" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

/**
 * AcademicsPage (ABC Combined + D)
 * Courses & assignments, calendar & study sessions, study resources,
 * and the AI study-plan engine.
 *
 * Signed-in students see (and can add) their own records; guests see labelled
 * sample data. Load failures surface as an error with retry — never as fake data.
 */
export default function AcademicsPage({ onNavigate, onNotify }) {
  const [activeSubTab, setActiveSubTab] = useState('courses'); // 'courses' | 'calendar' | 'resources' | 'studyplans'
  const [openForm, setOpenForm] = useState(null); // 'course' | 'assignment' | 'event' | 'resource' | null
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const hub = useAsyncResource(loadAcademicHub, {
    errorMessage: 'Unable to load your academic data. Please check your connection and try again.',
  });

  useEffect(() => {
    hub.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = hub.data;
  const courses = data?.courses || [];
  const assignments = data?.assignments || [];
  const events = data?.events || [];
  const sessions = data?.sessions || [];
  const resources = data?.resources || [];
  const plan = data?.plan || null;
  const isSample = Boolean(data?.isSample);
  const canEdit = Boolean(data) && !isSample;

  const courseOptions = [
    { value: '', label: 'No course' },
    ...courses.map((course) => ({
      value: course.id,
      label: course.code ? `${course.code} – ${course.name}` : course.name,
    })),
  ];

  // Persist a new record, refresh the screen and tell the student
  const saveAndRefresh = async (create, payload, successMessage) => {
    await create(payload);
    await hub.load();
    onNotify?.(successMessage, 'success');
  };

  const handleGeneratePlan = async () => {
    if (!canEdit) return;
    setIsGeneratingPlan(true);
    try {
      await generateStudyPlan({ days: 7 });
      const updated = await getCurrentStudyPlan();
      hub.setData((prev) => ({ ...prev, plan: updated }));
      onNotify?.('Study plan updated from your assignments and goals.', 'success');
    } catch (err) {
      onNotify?.(err?.message || 'Could not generate a study plan right now.', 'error');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const subTabs = [
    { id: 'courses', label: 'Courses & Assignments', icon: GraduationCap, count: courses.length },
    { id: 'calendar', label: 'Schedule & Sessions', icon: Calendar, count: events.length },
    { id: 'resources', label: 'Study Resources', icon: BookOpen, count: resources.length },
    { id: 'studyplans', label: 'AI Study Engine', icon: Zap, badge: 'AI' },
  ];

  // ── Create forms ──────────────────────────────────────────────────────────
  const courseFields = [
    { name: 'name', label: 'Course name', required: true, maxLength: 100, placeholder: 'e.g. Data Structures' },
    { name: 'code', label: 'Course code', half: true, maxLength: 20, placeholder: 'e.g. CS 301' },
    { name: 'credits', label: 'Credits', type: 'number', half: true, min: 0, max: 30, step: 1 },
    { name: 'instructor', label: 'Instructor', maxLength: 100, placeholder: 'e.g. Dr. Mehta' },
  ];

  const assignmentFields = [
    { name: 'title', label: 'Title', required: true, maxLength: 150, placeholder: 'e.g. Graph algorithms problem set' },
    { name: 'courseId', label: 'Course', type: 'select', options: courseOptions, half: true },
    { name: 'priority', label: 'Priority', type: 'select', options: ASSIGNMENT_PRIORITIES, half: true },
    { name: 'due', label: 'Due', type: 'datetime-local', required: true },
  ];

  const eventFields = [
    { name: 'title', label: 'Title', required: true, maxLength: 150, placeholder: 'e.g. Algorithms lecture' },
    { name: 'eventType', label: 'Type', type: 'select', options: EVENT_TYPES, half: true },
    { name: 'courseId', label: 'Course', type: 'select', options: courseOptions, half: true },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'start', label: 'Starts', type: 'time', required: true, half: true },
    {
      name: 'end',
      label: 'Ends',
      type: 'time',
      required: true,
      half: true,
      validate: (value, values) => (values.start && value <= values.start ? 'End time must be after the start time.' : null),
    },
    { name: 'location', label: 'Location', maxLength: 150, placeholder: 'e.g. Hall 402' },
  ];

  const resourceFields = [
    { name: 'title', label: 'Title', required: true, maxLength: 200, placeholder: 'e.g. Algorithms question bank' },
    { name: 'resourceType', label: 'Type', type: 'select', options: RESOURCE_TYPES, half: true },
    { name: 'courseId', label: 'Course', type: 'select', options: courseOptions, half: true },
    {
      name: 'url',
      label: 'Link (optional)',
      type: 'url',
      placeholder: 'https://…',
      validate: (value) => (value && !/^https?:\/\//i.test(value.trim()) ? 'Enter a full link starting with http:// or https://.' : null),
    },
    { name: 'description', label: 'Notes (optional)', type: 'textarea', rows: 2, maxLength: 1000 },
  ];

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* Academics Hub Header */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl ${CARD_SURFACE}`}>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Academic &amp; Study Hub
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
            Your courses, timetable, study resources and an AI-built weekly study plan in one place.
          </p>
        </div>

        <Tabs
          idPrefix="academics"
          ariaLabel="Academic sections"
          tabs={subTabs}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
        />
      </div>

      {hub.isLoading && <ListSkeleton rows={4} label="Loading your academic data" />}

      {hub.loadError && (
        <ErrorState
          headingLevel={2}
          title="Academic data unavailable"
          message={hub.loadError}
          onRetry={hub.load}
          retryLabel="Reload"
        />
      )}

      {data && (
        <>
          {isSample && (
            <SampleDataBanner onSignIn={() => onNavigate?.('account')} what="courses, timetable, resources and study plans" />
          )}

          {/* Courses & Assignments */}
          {activeSubTab === 'courses' && (
            <TabPanel idPrefix="academics" tabId="courses" className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your courses</h2>
                {canEdit && <AddButton onClick={() => setOpenForm('course')}>Add course</AddButton>}
              </div>

              {courses.length === 0 ? (
                <EmptyState
                  headingLevel={3}
                  icon={<GraduationCap className="w-6 h-6" aria-hidden="true" />}
                  title="No courses yet"
                  description="Add the courses you are taking this semester to organise assignments, classes and resources around them."
                  action={canEdit ? <AddButton onClick={() => setOpenForm('course')}>Add your first course</AddButton> : null}
                />
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
                  {courses.map((course) => (
                    <li
                      key={course.id}
                      className={`p-5 rounded-2xl ${CARD_SURFACE} space-y-3 hover:border-blue-400 transition-all`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {course.code ? (
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                            {course.code}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          {course.credits} {course.credits === 1 ? 'credit' : 'credits'}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{course.name}</h3>
                        {course.faculty && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Faculty: {course.faculty}</p>
                        )}
                      </div>
                      {course.room && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                          Room: {course.room}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Assignments */}
              <section className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4`} aria-label="Assignments">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-700 dark:text-indigo-400" aria-hidden="true" />
                    <span>Upcoming Deliverables &amp; Assignments</span>
                  </h2>
                  {canEdit && <AddButton onClick={() => setOpenForm('assignment')}>Add assignment</AddButton>}
                </div>
                {assignments.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5">
                    No assignments yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 list-none">
                    {assignments.map((assignment) => {
                      const badge = assignmentBadge(assignment);
                      return (
                        <li key={assignment.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {assignment.courseCode && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
                                  {assignment.courseCode}
                                </span>
                              )}
                              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{assignment.title}</span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3">
                              <span>Due: {assignment.dueDate}</span>
                              {assignment.estimatedHours && (
                                <>
                                  <span aria-hidden="true">•</span>
                                  <span>Est: {assignment.estimatedHours} hrs</span>
                                </>
                              )}
                              {(assignment.priority === 'high' || assignment.priority === 'urgent') && (
                                <>
                                  <span aria-hidden="true">•</span>
                                  <span className="font-semibold text-rose-700 dark:text-rose-400">{formatStatus(assignment.priority)} priority</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 self-start sm:self-center px-2.5 py-1 rounded-full text-xs font-bold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </TabPanel>
          )}

          {/* Schedule & Study Sessions */}
          {activeSubTab === 'calendar' && (
            <TabPanel idPrefix="academics" tabId="calendar" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4`} aria-label="Today's timetable">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                    <span>Today's Classes &amp; Events</span>
                  </h2>
                  {canEdit && <AddButton onClick={() => setOpenForm('event')}>Add class</AddButton>}
                </div>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5">
                    Nothing scheduled for today.
                  </p>
                ) : (
                  <ul className="space-y-3 list-none">
                    {events.map((event) => (
                      <li key={event.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{event.title}</div>
                          {event.location && <div className="text-xs text-slate-600 dark:text-slate-400">{event.location}</div>}
                        </div>
                        <span className="shrink-0 px-3 py-1 rounded-xl text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                          {event.time}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4`} aria-label="Study sessions">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                  <span>Dedicated Study Sessions</span>
                </h2>
                {sessions.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5">
                    No study sessions planned.
                  </p>
                ) : (
                  <ul className="space-y-3 list-none">
                    {sessions.map((session) => (
                      <li key={session.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {session.subject ? `${session.subject}: ${session.topic}` : session.topic}
                          </div>
                          {session.plannedDuration && (
                            <div className="text-xs text-slate-600 dark:text-slate-400">Duration: {session.plannedDuration}</div>
                          )}
                        </div>
                        <span className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                          {formatStatus(session.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabPanel>
          )}

          {/* Study Resources */}
          {activeSubTab === 'resources' && (
            <TabPanel idPrefix="academics" tabId="resources" className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Study resources</h2>
                {canEdit && <AddButton onClick={() => setOpenForm('resource')}>Add resource</AddButton>}
              </div>
              {resources.length === 0 ? (
                <EmptyState
                  headingLevel={3}
                  icon={<BookOpen className="w-6 h-6" aria-hidden="true" />}
                  title="No study resources yet"
                  description="Save notes, links and references so they are one tap away when you study."
                  action={canEdit ? <AddButton onClick={() => setOpenForm('resource')}>Add a resource</AddButton> : null}
                />
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
                  {resources.map((resource) => (
                    <li key={resource.id} className={`p-5 rounded-2xl ${CARD_SURFACE} space-y-3 flex flex-col justify-between hover:border-blue-400 transition-all`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          {resource.course ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400">
                              {resource.course}
                            </span>
                          ) : (
                            <span />
                          )}
                          {resource.size && <span className="text-[11px] text-slate-600 dark:text-slate-400">{resource.size}</span>}
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">{resource.title}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{resource.type}</p>
                      </div>
                      {resource.link ? (
                        <a
                          href={resource.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Open resource</span>
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : (
                        <span className="w-full mt-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isSample ? 'Sample resource' : 'No link attached'}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabPanel>
          )}

          {/* AI Study Plans Engine */}
          {activeSubTab === 'studyplans' && (
            <TabPanel idPrefix="academics" tabId="studyplans" className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-6`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Work scheduling engine</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {plan?.title || 'Weekly Study Plan'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={isGeneratingPlan || !canEdit}
                  aria-busy={isGeneratingPlan}
                  title={canEdit ? undefined : 'Sign in to build a plan from your own assignments and goals'}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                >
                  <Zap className={`w-4 h-4 ${isGeneratingPlan ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{isGeneratingPlan ? 'Generating…' : plan ? 'Recalculate AI Plan' : 'Generate AI Plan'}</span>
                </button>
              </div>

              {!plan ? (
                <EmptyState
                  headingLevel={3}
                  icon={<Zap className="w-6 h-6" aria-hidden="true" />}
                  title="No study plan yet"
                  description="Generate a plan and the engine will schedule focus sessions around your assignments and goals."
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Plan progress</span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                        {Number.isFinite(plan.targetCompletion) ? `${plan.targetCompletion}%` : '—'}
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Allocated focus hours</span>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{plan.allocatedHours} hrs</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Hours completed</span>
                      <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">{plan.completedHours} hrs</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">Scheduled focus work items</h3>
                    {plan.items.length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        This plan has no work items — add assignments or goals, then recalculate.
                      </p>
                    ) : (
                      <ul className="space-y-2.5 list-none">
                        {plan.items.map((item) => (
                          <li key={item.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <CheckCircle2
                                className={`w-4 h-4 shrink-0 ${item.status === 'completed' ? 'text-emerald-700' : 'text-slate-400'}`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{item.title}</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                  {[item.day, item.duration && `Duration: ${item.duration}`].filter(Boolean).join(' • ')}
                                </div>
                              </div>
                            </div>
                            <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                              item.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                            }`}>
                              {formatStatus(item.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </TabPanel>
          )}
        </>
      )}

      {/* Add forms (signed-in students only) */}
      <EntityFormModal
        isOpen={openForm === 'course'}
        onClose={() => setOpenForm(null)}
        title="Add course"
        icon={<GraduationCap className="w-5 h-5 text-blue-700 dark:text-blue-400" />}
        fields={courseFields}
        initialValues={{ credits: 3 }}
        submitLabel="Add course"
        onSubmit={(values) =>
          saveAndRefresh(
            createCourse,
            {
              name: values.name.trim(),
              ...(values.code?.trim() ? { code: values.code.trim() } : {}),
              ...(values.instructor?.trim() ? { instructor: values.instructor.trim() } : {}),
              credits: Number(values.credits) || 0,
            },
            'Course added.'
          )
        }
      />

      <EntityFormModal
        isOpen={openForm === 'assignment'}
        onClose={() => setOpenForm(null)}
        title="Add assignment"
        icon={<FileText className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />}
        fields={assignmentFields}
        initialValues={{ priority: 'medium', due: toLocalInput(tomorrowAt(23, 59)) }}
        submitLabel="Add assignment"
        onSubmit={(values) =>
          saveAndRefresh(
            createAssignment,
            {
              title: values.title.trim(),
              due_date: new Date(values.due).getTime(),
              priority: values.priority,
              ...(values.courseId ? { course_id: values.courseId } : {}),
            },
            'Assignment added.'
          )
        }
      />

      <EntityFormModal
        isOpen={openForm === 'event'}
        onClose={() => setOpenForm(null)}
        title="Add class or event"
        icon={<Calendar className="w-5 h-5 text-blue-700 dark:text-blue-400" />}
        fields={eventFields}
        initialValues={{ eventType: 'lecture', date: toLocalInput(new Date(), false), start: '09:00', end: '10:00' }}
        submitLabel="Add to timetable"
        onSubmit={(values) =>
          saveAndRefresh(
            createCalendarEvent,
            {
              title: values.title.trim(),
              event_type: values.eventType,
              start_time: new Date(`${values.date}T${values.start}`).getTime(),
              end_time: new Date(`${values.date}T${values.end}`).getTime(),
              ...(values.location?.trim() ? { location: values.location.trim() } : {}),
              ...(values.courseId ? { course_id: values.courseId } : {}),
            },
            'Added to your timetable.'
          )
        }
      />

      <EntityFormModal
        isOpen={openForm === 'resource'}
        onClose={() => setOpenForm(null)}
        title="Add study resource"
        icon={<BookOpen className="w-5 h-5 text-violet-700 dark:text-violet-400" />}
        fields={resourceFields}
        initialValues={{ resourceType: 'link' }}
        submitLabel="Save resource"
        onSubmit={(values) =>
          saveAndRefresh(
            createStudyResource,
            {
              title: values.title.trim(),
              resource_type: values.resourceType,
              ...(values.url?.trim() ? { url: values.url.trim() } : {}),
              ...(values.description?.trim() ? { description: values.description.trim() } : {}),
              ...(values.courseId ? { course_id: values.courseId } : {}),
            },
            'Resource saved.'
          )
        }
      />
    </div>
  );
}
