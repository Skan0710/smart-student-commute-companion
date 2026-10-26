import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  Compass, 
  Users, 
  Target, 
  Calendar, 
  BookOpen, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrainFront,
  Zap
} from 'lucide-react';
import { getCourses, getAssignments, getTodayCalendar, getCurrentStudyPlan } from '../services/academics';
import { getStudentGoals, getSharedJourneys } from '../services/communityGoals';

/**
 * MainDashboardPage
 *
 * Provides a rich, unified overview of the entire student platform:
 * - Academic Schedule & Current Courses
 * - AI Study Plan & Productivity Milestones
 * - Quick Route Planning & Live Disruptions
 * - Goals & Shared Peer Travel Groups
 */
export default function MainDashboardPage({ onNavigate, reportsCount = 0 }) {
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [studyPlan, setStudyPlan] = useState(null);
  const [goals, setGoals] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [c, a, s, sp, g, j] = await Promise.all([
          getCourses(),
          getAssignments(),
          getTodayCalendar(),
          getCurrentStudyPlan(),
          getStudentGoals(),
          getSharedJourneys()
        ]);
        setCourses(c);
        setAssignments(a);
        setSchedule(s);
        setStudyPlan(sp);
        setGoals(g);
        setJourneys(j);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-8 font-sans">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 dark:from-slate-900 dark:via-blue-950 dark:to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-blue-500/20">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-blue-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Welcome back to Smart Student Companion</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Your Complete Student Platform
          </h1>
          <p className="text-sm sm:text-base text-blue-100 dark:text-slate-300 font-normal leading-relaxed">
            Everything you need for Mumbai student life: real-time campus commute routing, class schedules, AI study planners, and collaborative student travel.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate?.('planner')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-blue-700 font-bold text-xs sm:text-sm shadow-md hover:bg-blue-50 active:scale-95 transition-all"
            >
              <Compass className="w-4 h-4" />
              <span>Plan Today's Commute</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate?.('academics')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs sm:text-sm active:scale-95 transition-all"
            >
              <GraduationCap className="w-4 h-4" />
              <span>View Academics Hub</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Overview Quick Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Courses */}
        <div 
          onClick={() => onNavigate?.('academics')}
          className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Enrolled Courses</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{courses.length || 4}</span>
            <span className="text-xs text-slate-500">Subjects this semester</span>
          </div>
          <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
            <span>Manage courses &amp; resources</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Card 2: Pending Tasks & Assignments */}
        <div 
          onClick={() => onNavigate?.('academics')}
          className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Assignments Due</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {assignments.filter(a => a.status !== 'completed').length || 2}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Pending submissions</span>
          </div>
          <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
            <span>View task deadlines</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Card 3: AI Study Plan */}
        <div 
          onClick={() => onNavigate?.('academics')}
          className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">AI Study Plan</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{studyPlan?.targetCompletion || '82%'}</span>
            <span className="text-xs text-slate-500">Weekly target hit</span>
          </div>
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
            <span>Check scheduled sessions</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Card 4: Shared Commute Groups */}
        <div 
          onClick={() => onNavigate?.('community')}
          className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-violet-400 dark:hover:border-violet-500 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Student Travel Pools</span>
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{journeys.length || 3}</span>
            <span className="text-xs text-slate-500">Active campus rides</span>
          </div>
          <div className="mt-2 text-xs text-violet-600 dark:text-violet-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
            <span>Join or coordinate journeys</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Middle Grid: Today's Schedule & Academic Assignments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule (Subsystem B) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Calendar className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Today's Schedule &amp; Lectures
              </h2>
            </div>
            <button
              onClick={() => onNavigate?.('academics')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Full Calendar
            </button>
          </div>

          <div className="space-y-3 pt-1">
            {schedule.slice(0, 3).map((item) => (
              <div 
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{item.location}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Study Plan Items (Subsystem D) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <Zap className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                AI Study Plan &amp; Focus Tasks
              </h2>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
              Active Plan
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {studyPlan?.items?.slice(0, 3).map((task) => (
              <div 
                key={task.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className={`w-4 h-4 ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                  <div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {task.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Scheduled: {task.day} • {task.duration}
                    </div>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                  task.status === 'completed' 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' 
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Commute Overview & Active Student Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commute Quick Access & Live Disruptions */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Compass className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Transit &amp; Route Planner
              </h2>
            </div>
            <button
              onClick={() => onNavigate?.('planner')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Full Planner
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/60 border border-blue-100 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Real-Time Live Transit Alerts
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                {reportsCount} Active Disruptions
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Western Line local trains, Metro Line 1 &amp; 2A/7 real-time delays verified with crowd-sourced student reporting.
            </p>
            <div className="pt-1">
              <button
                onClick={() => onNavigate?.('planner')}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-all"
              >
                Find Best Multimodal Route to College
              </button>
            </div>
          </div>
        </div>

        {/* Goals & Student Milestones (Subsystem E) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                <Target className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Student Goals &amp; Milestones
              </h2>
            </div>
            <button
              onClick={() => onNavigate?.('community')}
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              View All Goals
            </button>
          </div>

          <div className="space-y-3 pt-1">
            {goals.slice(0, 2).map((goal) => (
              <div 
                key={goal.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{goal.title}</span>
                  <span className="text-xs font-bold text-violet-600 dark:text-violet-400">{goal.progress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full" 
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex justify-between">
                  <span>Category: {goal.category}</span>
                  <span>Target: {goal.targetDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
