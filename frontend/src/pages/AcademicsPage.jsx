import React, { useState, useEffect } from 'react';
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
  Download,
  AlertCircle
} from 'lucide-react';
import { 
  getCourses, 
  getAssignments, 
  getTodayCalendar, 
  getStudySessions, 
  getStudyResources, 
  getCurrentStudyPlan,
  generateStudyPlan
} from '../services/academics';

/**
 * AcademicsPage (ABC Combined + D)
 * Subsystem A: Courses & Assignments
 * Subsystem B: Calendar & Study Sessions
 * Subsystem C: Study Resources & Materials
 * Subsystem D: AI Study Plans & Work Scheduling Engine
 */
export default function AcademicsPage() {
  const [activeSubTab, setActiveSubTab] = useState('courses'); // 'courses' | 'calendar' | 'resources' | 'studyplans'
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [studySessions, setStudySessions] = useState([]);
  const [resources, setResources] = useState([]);
  const [studyPlan, setStudyPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [c, a, cal, sess, res, plan] = await Promise.all([
          getCourses(),
          getAssignments(),
          getTodayCalendar(),
          getStudySessions(),
          getStudyResources(),
          getCurrentStudyPlan()
        ]);
        setCourses(c);
        setAssignments(a);
        setCalendarEvents(cal);
        setStudySessions(sess);
        setResources(res);
        setStudyPlan(plan);
      } catch (err) {
        console.error('Failed to load academic data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleGeneratePlan = async () => {
    setIsGeneratingPlan(true);
    try {
      await generateStudyPlan({ targetHours: 20 });
      const updated = await getCurrentStudyPlan();
      setStudyPlan(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const subTabs = [
    { id: 'courses', label: 'Courses & Assignments', icon: GraduationCap, badge: courses.length },
    { id: 'calendar', label: 'Schedule & Sessions', icon: Calendar, badge: calendarEvents.length },
    { id: 'resources', label: 'Study Resources Hub', icon: BookOpen, badge: resources.length },
    { id: 'studyplans', label: 'AI Study Engine', icon: Zap, badge: 'AI' },
  ];

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* Academics Hub Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              Subsystems A • B • C • D
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
            Academic &amp; Study Hub
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Integrated curriculum management, university timetable, resource repository, and autonomous study engine.
          </p>
        </div>

        {/* Sub-tab Navigation Pills */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab 1: Courses & Assignments (A) */}
      {activeSubTab === 'courses' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {courses.map((course) => (
              <div 
                key={course.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 hover:border-blue-400 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                    {course.code}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{course.credits} Credits</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                    {course.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Faculty: {course.faculty}</p>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>Room: {course.room}</span>
                  <span className="text-emerald-600 font-semibold">Active</span>
                </div>
              </div>
            ))}
          </div>

          {/* Assignments Section */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>Upcoming Course Deliverables &amp; Assignments</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {assignments.map((asgn) => (
                <div key={asgn.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                        {asgn.courseCode}
                      </span>
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {asgn.title}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span>Due: {asgn.dueDate}</span>
                      <span>•</span>
                      <span>Est: {asgn.estimatedHours} hrs</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      asgn.status === 'completed' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' 
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {asgn.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Schedule & Calendar Sessions (B) */}
      {activeSubTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>University Class Timetable</span>
            </h2>
            <div className="space-y-3">
              {calendarEvents.map((evt) => (
                <div key={evt.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{evt.title}</div>
                    <div className="text-xs text-slate-500">{evt.location}</div>
                  </div>
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    {evt.time}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              <span>Dedicated Study Sessions</span>
            </h2>
            <div className="space-y-3">
              {studySessions.map((sess) => (
                <div key={sess.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{sess.subject}: {sess.topic}</div>
                    <div className="text-xs text-slate-500">Duration: {sess.plannedDuration}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                    {sess.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 3: Study Resources & Materials Hub (C) */}
      {activeSubTab === 'resources' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {resources.map((res) => (
              <div key={res.id} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 flex flex-col justify-between hover:border-blue-400 transition-all">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                      {res.course}
                    </span>
                    <span className="text-[11px] text-slate-400">{res.size}</span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                    {res.title}
                  </h3>
                  <p className="text-xs text-slate-500">{res.type}</p>
                </div>
                <button
                  type="button"
                  className="w-full mt-2 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Access Material</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tab 4: AI Study Plans Engine (D) */}
      {activeSubTab === 'studyplans' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Autonomous Work Scheduling Engine</span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                {studyPlan?.title || 'Weekly Study Plan'}
              </h2>
            </div>
            <button
              onClick={handleGeneratePlan}
              disabled={isGeneratingPlan}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
              <span>{isGeneratingPlan ? 'Generating...' : 'Recalculate AI Plan'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500">Weekly Target Progress</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {studyPlan?.targetCompletion || '82%'}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500">Allocated Focus Hours</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {studyPlan?.allocatedHours || 18} hrs
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500">Hours Completed</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {studyPlan?.completedHours || 12.5} hrs
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Scheduled Focus Work Items</h3>
            <div className="space-y-2.5">
              {studyPlan?.items?.map((item) => (
                <div key={item.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className={`w-4 h-4 ${item.status === 'completed' ? 'text-emerald-500' : 'text-slate-400'}`} />
                    <div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.day} • Duration: {item.duration}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    item.status === 'completed' 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' 
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
