import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Target, 
  Plus, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  Car, 
  ShieldCheck, 
  ArrowRight,
  Sparkles,
  TrendingUp,
  Compass
} from 'lucide-react';
import { getStudentGoals, createStudentGoal, getSharedJourneys, getMeetingPoints } from '../services/communityGoals';

/**
 * CommunityGoalsPage (EF Combined)
 * Subsystem E: Student Goals & Milestones
 * Subsystem F: Advanced Shared Travel Coordination
 */
export default function CommunityGoalsPage({ onJoinSharedJourney, onOpenCreateRideGroup }) {
  const [activeTab, setActiveTab] = useState('goals'); // 'goals' | 'sharedtravel'
  const [goals, setGoals] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [meetingPoints, setMeetingPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state for new goal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState('Academic');
  const [newGoalTarget, setNewGoalTarget] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [g, j, mp] = await Promise.all([
          getStudentGoals(),
          getSharedJourneys(),
          getMeetingPoints()
        ]);
        setGoals(g);
        setJourneys(j);
        setMeetingPoints(mp);
      } catch (err) {
        console.error('Failed to load community & goals:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    try {
      await createStudentGoal({
        title: newGoalTitle,
        category: newGoalCategory,
        targetDate: newGoalTarget || 'End of Term',
        progress: 10
      });
      const updated = await getStudentGoals();
      setGoals(updated);
      setShowGoalModal(false);
      setNewGoalTitle('');
      setNewGoalTarget('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* Top Banner & Tab Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
              Subsystems E &amp; F
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
            Community &amp; Student Goals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Set and track milestone targets, pair with fellow students for safe shared rides, and coordinate campus commute pools.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('goals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'goals'
                ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Goals &amp; Milestones (E)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
              {goals.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('sharedtravel')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'sharedtravel'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Shared Travel Journeys (F)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              {journeys.length}
            </span>
          </button>
        </div>
      </div>

      {/* Subsystem E: Student Goals & Milestones */}
      {activeTab === 'goals' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-600" />
              <span>Active Semester Milestones &amp; Academic Goals</span>
            </h2>
            <button
              onClick={() => setShowGoalModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Goal</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {goals.map((goal) => (
              <div 
                key={goal.id} 
                className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 hover:border-violet-400 dark:hover:border-violet-500 transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                      {goal.category}
                    </span>
                    <span className="text-xs font-bold text-slate-500">{goal.targetDate}</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">
                    {goal.title}
                  </h3>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500">Progress</span>
                    <span className="text-violet-600 dark:text-violet-400">{goal.progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-500" 
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Goal Modal */}
          {showGoalModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
              <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create New Milestone Goal</h3>
                <form onSubmit={handleAddGoal} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Goal Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Master Graph Theory problem sets"
                      value={newGoalTitle}
                      onChange={(e) => setNewGoalTitle(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                    <select
                      value={newGoalCategory}
                      onChange={(e) => setNewGoalCategory(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="Academic">Academic</option>
                      <option value="Research">Research</option>
                      <option value="Commute">Commute / Transit</option>
                      <option value="Career">Career &amp; Internships</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Target Date</label>
                    <input
                      type="text"
                      placeholder="e.g. End of December"
                      value={newGoalTarget}
                      onChange={(e) => setNewGoalTarget(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowGoalModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-sm"
                    >
                      Save Goal
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subsystem F: Advanced Shared Travel Coordination */}
      {activeTab === 'sharedtravel' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Car className="w-5 h-5 text-blue-600" />
                <span>Student Commute Safety Pools &amp; Shared Journeys</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Peer-verified students travelling along common Mumbai routes to college.
              </p>
            </div>
            {onOpenCreateRideGroup && (
              <button
                onClick={onOpenCreateRideGroup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create Shared Journey</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {journeys.map((j) => (
              <div 
                key={j.id} 
                className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between hover:border-blue-400 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                      {j.mode}
                    </span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{j.seatsAvailable} Seats Open</span>
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">
                    {j.title}
                  </h3>

                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">From: <strong>{j.origin}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">To: <strong>{j.destination}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Departure: {j.departureTime}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Organized by {j.organizer}</span>
                  <button
                    onClick={() => onJoinSharedJourney?.(j)}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 text-xs font-bold transition-all"
                  >
                    Request to Join
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Supported Public Meeting Points */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span>Designated Safe Campus Meeting Points</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {meetingPoints.map((mp) => (
                <div key={mp.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="font-bold text-xs text-slate-900 dark:text-white">{mp.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{mp.landmark}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
