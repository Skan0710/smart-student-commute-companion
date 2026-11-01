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
  Link2,
  Camera,
  UploadCloud,
  Trash2,
  Check,
  HelpCircle,
  Edit3,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  loadAcademicHub,
  getCurrentStudyPlan,
  generateStudyPlan,
  generateInteractiveAiStudyPlan,
  createCourse,
  createAssignment,
  updateAssignmentStatus,
  deleteAssignment,
  createCalendarEvent,
  createStudyResource,
  createStudySession
} from '../services/academics';
import useAsyncResource from '../hooks/useAsyncResource';
import TimetableScannerModal from '../components/TimetableScannerModal';
import { formatStatus } from '../utils/formatters';
import {
  Tabs,
  TabPanel,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SampleDataBanner,
  EntityFormModal,
  AiFormattedText
} from '../components/ui';

const CARD_SURFACE =
  'bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] shadow-[0_1px_3px_rgba(31,36,33,0.06),0_12px_32px_-14px_rgba(31,36,33,0.12)] dark:shadow-none';

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
  const [openForm, setOpenForm] = useState(null); // 'course' | 'assignment' | 'event' | 'resource' | 'session' | null
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedEvents, setScannedEvents] = useState([]);

  // AI Questionnaire Consultation State
  const [aiExamHas, setAiExamHas] = useState(null); // 'yes' | 'no' | null
  const [aiExamTimeframe, setAiExamTimeframe] = useState(''); // e.g. '3 days'
  const [aiStudyHours, setAiStudyHours] = useState(''); // e.g. '4'
  const [aiSleepHours, setAiSleepHours] = useState(''); // e.g. '7'
  const [aiSelectedSubjects, setAiSelectedSubjects] = useState([]);
  const [customAiPlan, setCustomAiPlan] = useState(null);
  const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(true);

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
  const events = [...(data?.events || []), ...scannedEvents];
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

  const handleSaveScannedTimetable = async (slots) => {
    const formatTimeDisplay = (time24) => {
      if (!time24) return '09:00 AM';
      const [h, m] = time24.split(':').map(Number);
      const isPM = h >= 12;
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
    };

    const newCreatedEvents = slots.map((slot) => {
      const timeText = `${formatTimeDisplay(slot.startTime)} – ${formatTimeDisplay(slot.endTime)}`;
      return {
        id: slot.id || `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: slot.subjectCode ? `${slot.subjectCode}: ${slot.title}` : slot.title,
        time: `${slot.day ? `${slot.day} • ` : ''}${timeText}`,
        location: slot.location || 'Classroom',
        type: slot.eventType || 'lecture',
      };
    });

    setScannedEvents((prev) => [...newCreatedEvents, ...prev]);

    if (canEdit) {
      for (const slot of slots) {
        try {
          const now = new Date();
          const [startH, startM] = (slot.startTime || '09:00').split(':').map(Number);
          const [endH, endM] = (slot.endTime || '10:00').split(':').map(Number);
          const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM);
          const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM);
          await createCalendarEvent({
            title: slot.subjectCode ? `${slot.subjectCode}: ${slot.title}` : slot.title,
            location: slot.location || null,
            event_type: slot.eventType || 'lecture',
            start_time: startDate.getTime(),
            end_time: endDate.getTime(),
          });
        } catch (err) {
          console.warn('Could not persist calendar event to backend:', err);
        }
      }
      hub.load();
    }

    onNotify?.(`Timetable updated! ${slots.length} class slot${slots.length === 1 ? '' : 's'} added to your schedule.`, 'success');
  };

  const groupedResources = React.useMemo(() => {
    const groups = {};
    resources.forEach((resource) => {
      const subjectName = resource.subjectName || resource.course || 'General Study Resources';
      if (!groups[subjectName]) {
        groups[subjectName] = {
          name: subjectName,
          code: resource.courseCode || '',
          items: []
        };
      }
      groups[subjectName].items.push(resource);
    });
    return Object.values(groups);
  }, [resources]);

  const groupedAssignments = React.useMemo(() => {
    const groups = {};
    const courseMap = {};
    courses.forEach((c) => {
      courseMap[c.id] = c.name || c.code;
    });

    assignments.forEach((assignment) => {
      const resolvedCourse = assignment.courseId ? courseMap[assignment.courseId] : null;
      const subjectName = assignment.subjectName || assignment.courseName || resolvedCourse || assignment.courseCode || 'General Assignments';
      if (!groups[subjectName]) {
        groups[subjectName] = {
          name: subjectName,
          code: assignment.courseCode || (assignment.courseId ? courseMap[assignment.courseId] : '') || '',
          items: []
        };
      }
      groups[subjectName].items.push(assignment);
    });
    return Object.values(groups);
  }, [assignments, courses]);

  // Pre-populate AI subject checkboxes from courses
  useEffect(() => {
    if (courses.length > 0 && aiSelectedSubjects.length === 0) {
      setAiSelectedSubjects(courses.map(c => c.name || c.code));
    }
  }, [courses, aiSelectedSubjects.length]);

  const handleGenerateInteractivePlan = async () => {
    if (!aiExamHas) {
      onNotify?.('Please answer whether you have an exam coming up.', 'error');
      return;
    }
    if (aiExamHas === 'yes' && !aiExamTimeframe.trim()) {
      onNotify?.('Please specify hours or days remaining before your exam.', 'error');
      return;
    }
    if (!aiStudyHours.trim()) {
      onNotify?.('Please enter how many hours you study per day.', 'error');
      return;
    }
    if (!aiSleepHours.trim()) {
      onNotify?.('Please enter how many hours you sleep per day.', 'error');
      return;
    }
    if (aiSelectedSubjects.length === 0) {
      onNotify?.('Please select at least one subject with an upcoming exam or study focus.', 'error');
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const res = await generateInteractiveAiStudyPlan({
        hasExam: aiExamHas,
        examTimeframe: aiExamTimeframe.trim(),
        dailyStudyHours: aiStudyHours.trim(),
        sleepHours: aiSleepHours.trim(),
        selectedSubjects: aiSelectedSubjects
      });

      if (res?.plan) {
        setCustomAiPlan(res.plan);
        setIsQuestionnaireOpen(false);
        onNotify?.('Your personalized AI Study Plan is ready!', 'success');
      } else {
        onNotify?.('Could not generate plan. Please try again.', 'error');
      }
    } catch (err) {
      onNotify?.(err?.message || 'Failed to generate AI plan.', 'error');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

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

  const handleToggleComplete = async (assignment) => {
    const isCompleted = assignment.status === 'completed';
    const nextStatus = isCompleted ? 'pending' : 'completed';

    hub.setData((prev) => {
      if (!prev?.assignments) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((item) =>
          item.id === assignment.id ? { ...item, status: nextStatus } : item
        ),
      };
    });

    if (canEdit && assignment.id) {
      try {
        await updateAssignmentStatus(assignment.id, nextStatus);
        onNotify?.(
          nextStatus === 'completed'
            ? `"${assignment.title}" marked as completed!`
            : `"${assignment.title}" marked as pending.`,
          'success'
        );
      } catch (err) {
        hub.setData((prev) => {
          if (!prev?.assignments) return prev;
          return {
            ...prev,
            assignments: prev.assignments.map((item) =>
              item.id === assignment.id ? { ...item, status: assignment.status } : item
            ),
          };
        });
        onNotify?.(err?.message || 'Could not update assignment status.', 'error');
      }
    } else {
      onNotify?.(
        nextStatus === 'completed'
          ? `"${assignment.title}" marked as completed!`
          : `"${assignment.title}" marked as pending.`,
        'success'
      );
    }
  };

  const handleDeleteAssignment = async (assignmentId, title) => {
    const previousAssignments = hub.data?.assignments || [];

    hub.setData((prev) => {
      if (!prev?.assignments) return prev;
      return {
        ...prev,
        assignments: prev.assignments.filter((item) => item.id !== assignmentId),
      };
    });

    if (canEdit && assignmentId) {
      try {
        await deleteAssignment(assignmentId);
        onNotify?.(`Assignment "${title || ''}" removed.`, 'info');
      } catch (err) {
        hub.setData((prev) => ({ ...prev, assignments: previousAssignments }));
        onNotify?.(err?.message || 'Could not remove assignment.', 'error');
      }
    } else {
      onNotify?.(`Assignment "${title || ''}" removed.`, 'info');
    }
  };

  const subTabs = [
    { id: 'courses', label: 'Courses', icon: GraduationCap, count: courses.length },
    { id: 'calendar', label: 'Schedule', icon: Calendar, count: events.length },
    { id: 'resources', label: 'Study Resources', icon: BookOpen, count: resources.length },
    { id: 'studyplans', label: 'AI Planner', icon: Sparkles },
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

  const sessionFields = [
    { name: 'title', label: 'Session title', required: true, maxLength: 120, placeholder: 'e.g. Graph Algorithms Revision' },
    { name: 'courseId', label: 'Course', type: 'select', options: courseOptions, half: true },
    { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', half: true, min: 15, max: 360, placeholder: '60' },
    { name: 'startTime', label: 'Scheduled date & time', type: 'datetime-local', required: true },
    { name: 'notes', label: 'Topics / goals for this session', maxLength: 300, placeholder: 'e.g. Solve 5 dynamic programming questions' },
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
            Your courses, timetable, study resources and an AI-optimized weekly study plan in one place.
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
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                            {course.name}
                          </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          {course.credits} {course.credits === 1 ? 'credit' : 'credits'}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{course.name}</h3>
                          {course.code && (
                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                              ({course.code})
                            </span>
                          )}
                        </div>
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
                    <FileText className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                    <span>Upcoming Deliverables &amp; Assignments</span>
                  </h2>
                  {canEdit && <AddButton onClick={() => setOpenForm('assignment')}>Add assignment</AddButton>}
                </div>
                {assignments.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5">
                    No assignments yet.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {groupedAssignments.map((group) => (
                      <div
                        key={group.name}
                        className="p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 space-y-3"
                      >
                        {/* Subject Group Header */}
                        <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                                {group.name}
                              </h3>
                              {group.code && group.code !== group.name && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                                  {group.code}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {group.items.length} {group.items.length === 1 ? 'task' : 'tasks'}
                          </span>
                        </div>

                        {/* Assignments under this Subject */}
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800 list-none">
                          {group.items.map((assignment) => {
                            const badge = assignmentBadge(assignment);
                            const isCompleted = assignment.status === 'completed';
                            return (
                              <li key={assignment.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`font-semibold text-sm transition-all ${isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                                      {assignment.title}
                                    </span>
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

                                {/* Interactive Actions: Mark Complete & Remove */}
                                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleComplete(assignment)}
                                    title={isCompleted ? 'Mark as pending' : 'Mark as completed'}
                                    aria-label={isCompleted ? `Mark ${assignment.title} as pending` : `Mark ${assignment.title} as completed`}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                      isCompleted
                                        ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60'
                                        : 'bg-white hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 hover:text-emerald-700 dark:text-slate-200 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700/60 shadow-2xs'
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                                        <span>Completed</span>
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                                        <span>Mark Complete</span>
                                      </>
                                    )}
                                  </button>

                                  {!isCompleted && (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAssignment(assignment.id, assignment.title)}
                                    title="Remove assignment"
                                    aria-label={`Remove assignment ${assignment.title}`}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all active:scale-95 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/60"
                                  >
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabPanel>
          )}

          {/* Schedule & Study Sessions */}
          {activeSubTab === 'calendar' && (
            <TabPanel idPrefix="academics" tabId="calendar" className="space-y-6">
              {/* Timetable OCR Scanner Banner */}
              <div className={`p-5 sm:p-6 rounded-3xl ${CARD_SURFACE} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-blue-200/80 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/70 via-sky-50/40 to-transparent dark:from-blue-950/40 dark:via-slate-900/40 dark:to-transparent shadow-xs`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                    <Camera className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Got a TimeTable?</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        Smart OCR
                      </span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                      Upload it and we fetch your courses for you.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] shrink-0 self-stretch sm:self-auto justify-center"
                >
                  <UploadCloud className="w-4 h-4" aria-hidden="true" />
                  <span>Upload Timetable</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      <span>Dedicated Study Sessions</span>
                    </h2>
                    {canEdit && <AddButton onClick={() => setOpenForm('session')}>Add session</AddButton>}
                  </div>
                  {sessions.length === 0 ? (
                    <div className="text-center py-6 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        No study sessions planned yet.
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setOpenForm('session')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Schedule Study Session</span>
                        </button>
                      )}
                    </div>
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
              </div>
            </TabPanel>
          )}

          {/* Study Resources */}
          {activeSubTab === 'resources' && (
            <TabPanel idPrefix="academics" tabId="resources" className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Study Resources by Subject</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Organised into individual subject rows to help distinguish between subjects and focus study
                  </p>
                </div>
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
                <div className="space-y-6">
                  {groupedResources.map((group) => (
                    <section
                      key={group.name}
                      className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4`}
                      aria-label={`Resources for ${group.name}`}
                    >
                      {/* Subject Name Row Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                                {group.name}
                              </h3>
                              {group.code && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                                  {group.code}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {group.items.length} {group.items.length === 1 ? 'study resource' : 'study resources'} available
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Individual Resources Under this Subject */}
                      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
                        {group.items.map((resource) => (
                          <li
                            key={resource.id}
                            className={`p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 space-y-3 flex flex-col justify-between hover:border-emerald-400 dark:hover:border-emerald-600 transition-all shadow-xs`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                                  {resource.type}
                                </span>
                                {resource.size && (
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                    {resource.size}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                                {resource.title}
                              </h4>
                              <p className="text-xs text-slate-600 dark:text-slate-400">{resource.course || group.name}</p>
                            </div>

                            {resource.link ? (
                              <a
                                href={resource.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full mt-2 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              >
                                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Open resource</span>
                                <span className="sr-only">(opens in a new tab)</span>
                              </a>
                            ) : (
                              <span className="w-full mt-2 py-2 px-3 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isSample ? 'Sample resource' : 'No link attached'}</span>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </TabPanel>
          )}

          {/* AI Study Plans Engine */}
          {activeSubTab === 'studyplans' && (
            <TabPanel idPrefix="academics" tabId="studyplans" className="space-y-6">
              {/* Header */}
              <div className={`p-6 rounded-3xl ${CARD_SURFACE} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span>Personalized AI Study Planner</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {customAiPlan ? customAiPlan.title : 'AI Academic & Exam Study Planner'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    Smart schedule tailored to your upcoming exam dates, daily study limits, and sleep requirements.
                  </p>
                </div>

                {customAiPlan && !isQuestionnaireOpen && (
                  <button
                    type="button"
                    onClick={() => setIsQuestionnaireOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs shadow-2xs transition-all active:scale-95 shrink-0"
                  >
                    <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Adjust Questionnaire Answers</span>
                  </button>
                )}
              </div>

              {/* Questionnaire Form Card */}
              {(isQuestionnaireOpen || !customAiPlan) && (
                <div className={`p-6 sm:p-8 rounded-3xl ${CARD_SURFACE} space-y-6 border-2 border-blue-100 dark:border-blue-950/60 shadow-md`}>
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-blue-600" />
                        <span>Student Study Questionnaire</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Please answer these questions so the AI can build an accurate, realistic study plan.
                      </p>
                    </div>
                    {customAiPlan && (
                      <button
                        type="button"
                        onClick={() => setIsQuestionnaireOpen(false)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        Cancel &amp; View Plan
                      </button>
                    )}
                  </div>

                  <div className="space-y-5">
                    {/* Q1: Do you have an exam? */}
                    <div className="space-y-2">
                      <label className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        1. Do you have an upcoming exam?
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setAiExamHas('yes')}
                          className={`flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold border transition-all active:scale-98 flex items-center justify-center gap-2 ${
                            aiExamHas === 'yes'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                          }`}
                        >
                          <CheckCircle2 className={`w-4 h-4 ${aiExamHas === 'yes' ? 'text-white' : 'text-slate-400'}`} />
                          <span>Yes, I have an exam</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAiExamHas('no');
                            setAiExamTimeframe('');
                          }}
                          className={`flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold border transition-all active:scale-98 flex items-center justify-center gap-2 ${
                            aiExamHas === 'no'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                          }`}
                        >
                          <CheckCircle2 className={`w-4 h-4 ${aiExamHas === 'no' ? 'text-white' : 'text-slate-400'}`} />
                          <span>No exam (Regular Semester)</span>
                        </button>
                      </div>
                    </div>

                    {/* Q2: If exam, how many hours/days before exam? */}
                    {aiExamHas === 'yes' && (
                      <div className="space-y-1.5 p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                        <label className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                          2. How many hours or days before your exam?
                        </label>
                        <input
                          type="text"
                          value={aiExamTimeframe}
                          onChange={(e) => setAiExamTimeframe(e.target.value)}
                          placeholder="e.g. 3 days, 48 hours, or 1 week"
                          className="w-full px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    )}

                    {/* Q3: How many hours do you study per day? */}
                    <div className="space-y-1.5">
                      <label className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        3. How many hours do you study per day?
                      </label>
                      <input
                        type="text"
                        value={aiStudyHours}
                        onChange={(e) => setAiStudyHours(e.target.value)}
                        placeholder="e.g. 4 hours"
                        className="w-full px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    {/* Q4: How many hours do you sleep? */}
                    <div className="space-y-1.5">
                      <label className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        4. How many hours do you sleep?
                      </label>
                      <input
                        type="text"
                        value={aiSleepHours}
                        onChange={(e) => setAiSleepHours(e.target.value)}
                        placeholder="e.g. 7 hours (preserved for mental alertness & retention)"
                        className="w-full px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    {/* Q5: Which subjects you got exam on? */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                          5. Which subjects do you have an exam on? (Select all that apply)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const allNames = courses.length > 0
                              ? courses.map(c => c.name || c.code)
                              : ['Data Structures & Algorithms', 'Database Management Systems', 'Computer Networks', 'Applied Mathematics'];
                            if (aiSelectedSubjects.length === allNames.length) {
                              setAiSelectedSubjects([]);
                            } else {
                              setAiSelectedSubjects(allNames);
                            }
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                        >
                          {aiSelectedSubjects.length === (courses.length || 4) ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>

                      {/* Course checkbox list */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {(courses.length > 0 ? courses : [
                          { id: 'c1', name: 'Data Structures & Algorithms', code: 'CS 301' },
                          { id: 'c2', name: 'Database Management Systems', code: 'CS 302' },
                          { id: 'c3', name: 'Computer Networks', code: 'CS 303' },
                          { id: 'c4', name: 'Applied Mathematics', code: 'MA 301' }
                        ]).map((course) => {
                          const subjectTitle = course.name || course.code;
                          const isChecked = aiSelectedSubjects.includes(subjectTitle);
                          return (
                            <button
                              key={course.id || subjectTitle}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setAiSelectedSubjects(prev => prev.filter(s => s !== subjectTitle));
                                } else {
                                  setAiSelectedSubjects(prev => [...prev, subjectTitle]);
                                }
                              }}
                              className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                                isChecked
                                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 shadow-2xs'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                              }`}
                            >
                              {isChecked ? (
                                <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <span className="font-bold text-xs sm:text-sm block truncate">{subjectTitle}</span>
                                {course.code && course.code !== subjectTitle && (
                                  <span className="text-[10px] text-slate-500 font-mono">{course.code}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleGenerateInteractivePlan}
                      disabled={
                        isGeneratingPlan ||
                        !aiExamHas ||
                        (aiExamHas === 'yes' && !aiExamTimeframe.trim()) ||
                        !aiStudyHours.trim() ||
                        !aiSleepHours.trim() ||
                        aiSelectedSubjects.length === 0
                      }
                      className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      <Sparkles className={`w-4 h-4 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingPlan ? 'Generating Custom AI Study Plan…' : 'Generate My Personalized AI Plan'}</span>
                    </button>
                    {(!aiExamHas || !aiStudyHours.trim() || !aiSleepHours.trim() || aiSelectedSubjects.length === 0) && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center mt-2 font-medium">
                        * Please answer all 5 questions above to calculate your study plan.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Personalized AI Plan Result */}
              {customAiPlan && !isQuestionnaireOpen && (
                <div className="space-y-6">
                  {/* Parameter badges */}
                  <div className="flex flex-wrap items-center gap-2.5 p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200">
                    <span className="font-bold">Active Configuration:</span>
                    <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-semibold">
                      {customAiPlan.hasExam === 'yes' ? `Exam in: ${customAiPlan.examTimeframe}` : 'Regular Semester'}
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-semibold">
                      ⏱️ {customAiPlan.dailyStudyHours} hrs study/day
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-semibold">
                      😴 {customAiPlan.sleepHours} hrs sleep
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-semibold">
                      📚 {customAiPlan.selectedSubjects.length} subjects
                    </span>
                  </div>

                  {/* Render Plan Content with formatted typography */}
                  <div className={`p-6 sm:p-8 rounded-3xl ${CARD_SURFACE} shadow-sm border border-slate-200/80 dark:border-slate-800`}>
                    <AiFormattedText text={customAiPlan.content} />
                  </div>
                </div>
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
        icon={<FileText className="w-5 h-5 text-blue-700 dark:text-blue-400" />}
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
        icon={<BookOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />}
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

      {/* Schedule Dedicated Study Session Modal */}
      <EntityFormModal
        isOpen={openForm === 'session'}
        onClose={() => setOpenForm(null)}
        title="Schedule Study Session"
        icon={<Clock className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />}
        fields={sessionFields}
        initialValues={{ durationMinutes: 60, startTime: toLocalInput(new Date()) }}
        submitLabel="Schedule Session"
        onSubmit={(values) =>
          saveAndRefresh(
            createStudySession,
            {
              title: values.title.trim(),
              startTime: values.startTime,
              durationMinutes: Number(values.durationMinutes) || 60,
              ...(values.courseId ? { courseId: values.courseId } : {}),
              ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
            },
            'Study session scheduled!'
          )
        }
      />

      {/* Timetable OCR Scanner Modal */}
      <TimetableScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSaveTimetable={handleSaveScannedTimetable}
      />
    </div>
  );
}
