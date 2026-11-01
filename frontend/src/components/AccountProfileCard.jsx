import React, { useState } from 'react';
import {
  GraduationCap,
  KeyRound,
  Mail,
  UserRound,
  Train,
  Check,
  Edit2,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  MapPin,
  Building,
  BookmarkCheck,
  Compass,
  Sparkles,
  LogOut,
  X
} from 'lucide-react';
import { Alert, Button, Input } from './ui';
import { readThemePreference, writeThemePreference, applyTheme } from '../utils/uiPreferences';
import { readAuthSession, writeAuthSession } from '../utils/authSession';
import { updateUserProfile } from '../services/auth';

const TRANSIT_CORRIDORS = [
  'Western Railway (Churchgate - Dahanu)',
  'Central Railway (CSMT - Kalyan / Thane)',
  'Harbour Line (CSMT - Panvel)',
  'BEST Bus Route A-422 (Vikhroli - Erla)',
  'Metro Line 1 (Versova - Ghatkopar)',
  'Metro Line 2A & 7 (Andheri - Dahisar)',
  'Metro Line 3 (Aqua Line)'
];

const DEPARTMENTS = [
  'Computer Engineering',
  'Information Technology',
  'Artificial Intelligence & Data Science',
  'Computer Science & Engineering (DS)',
  'Electronics & Telecommunication',
  'Mechanical Engineering',
  'Applied Sciences & Humanities'
];

export default function AccountProfileCard({
  user,
  isRefreshingSession = false,
  lastVerifiedAt = null,
  refreshError = null,
  onRequestSignOut,
  onProfileUpdated,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [collegeName, setCollegeName] = useState(user?.college_name || 'Dwarkadas J. Sanghvi College of Engineering');
  const [department, setDepartment] = useState(user?.department || 'Computer Engineering');
  const [studentId, setStudentId] = useState(user?.student_id || user?.roll_no || '60004220000');
  const [corridor, setCorridor] = useState(user?.preferred_corridor || 'Western Railway (Churchgate - Dahanu)');
  const [homeStation, setHomeStation] = useState(user?.home_station || 'Vile Parle');
  const [walkingTolerance, setWalkingTolerance] = useState(user?.max_walking_minutes || 15);
  const [selectedTheme, setSelectedTheme] = useState(() => readThemePreference());
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const displayName = fullName || user?.full_name || user?.email || 'Student';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleThemeChange = (newTheme) => {
    setSelectedTheme(newTheme);
    writeThemePreference(newTheme);
    applyTheme(newTheme);
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    if (!fullName.trim()) {
      setSaveError('Please enter your full name.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const updatedUser = {
      ...user,
      full_name: fullName.trim(),
      college_name: collegeName.trim() || 'Dwarkadas J. Sanghvi College of Engineering',
      department: department.trim(),
      student_id: studentId.trim(),
      roll_no: studentId.trim(),
      preferred_corridor: corridor,
      home_station: homeStation.trim() || 'Vile Parle',
      max_walking_minutes: Number(walkingTolerance) || 15
    };

    try {
      await updateUserProfile(user?.id, updatedUser);
      onProfileUpdated?.(updatedUser);
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setSaveError(err.message || 'Could not update profile. Saved locally.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="account-profile-heading"
      className="space-y-6 animate-fade-in font-sans"
    >
      {/* ─── Digital Student Campus ID Card ────────────────────────────── */}
      <div className="relative rounded-3xl bg-gradient-to-r from-[#800020] via-indigo-950 to-blue-950 text-white p-6 sm:p-8 shadow-2xl overflow-hidden border border-white/10">
        {/* Background Ambient Elements */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5 min-w-0">
            {/* Student Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-[#9c0028] via-indigo-600 to-teal-400 p-1 shadow-xl flex items-center justify-center">
                <div className="w-full h-full rounded-[22px] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center text-white font-black text-2xl sm:text-3xl tracking-wider">
                  {initials || <UserRound className="w-10 h-10" />}
                </div>
              </div>
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center shadow-md" title="Active Verified Session">
                <Check className="w-3.5 h-3.5 text-white" />
              </span>
            </div>

            {/* Student Identity Information */}
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  id="account-profile-heading"
                  className="text-xl sm:text-2xl font-black text-white tracking-tight truncate"
                >
                  {displayName}
                </h2>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 backdrop-blur-md">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  Verified Student
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 font-medium flex items-center gap-2 truncate">
                <Building className="w-4 h-4 text-blue-400 shrink-0" />
                <span>{collegeName}</span>
              </p>

              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap pt-0.5">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {user?.email || 'student@djsanghvi.edu'}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-teal-300 font-medium">{department}</span>
                {studentId && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="font-mono text-slate-400">ID: {studentId}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Triggers */}
          <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold border border-white/20 transition-all shadow-md active:scale-95"
            >
              {isEditing ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-4 h-4" />
                  <span>Edit Profile</span>
                </>
              )}
            </button>
            {onRequestSignOut && (
              <button
                type="button"
                onClick={onRequestSignOut}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs sm:text-sm font-bold border border-rose-500/30 transition-all shadow-md active:scale-95"
                title="Sign out of student profile"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Profile Saved Successfully">
          Your student profile and campus commute preferences have been updated!
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" title="Profile Update Error">
          {saveError}
        </Alert>
      )}

      {refreshError && (
        <Alert variant="warning" title="Could not refresh your profile">
          {refreshError} Showing the account details saved on this device.
        </Alert>
      )}

      {/* ─── Profile Content: Edit Form vs Display Cards ────────────────── */}
      {isEditing ? (
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-[#1e2440] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Edit Student Information</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Update your name, department, campus travel corridor, and base station.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="edit-full-name" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Full Name *
              </label>
              <input
                id="edit-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Anirudh"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-college" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                College / Institution
              </label>
              <input
                id="edit-college"
                type="text"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g. Dwarkadas J. Sanghvi College of Engineering"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="edit-dept" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Department / Branch
              </label>
              <select
                id="edit-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-roll" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Student ID / Roll No.
              </label>
              <input
                id="edit-roll"
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. 60004220000"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="edit-station" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Home / Base Station
              </label>
              <input
                id="edit-station"
                type="text"
                value={homeStation}
                onChange={(e) => setHomeStation(e.target.value)}
                placeholder="e.g. Vikhroli, Dadar, Borivali, Thane"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="edit-corridor" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Primary Transit Corridor
              </label>
              <select
                id="edit-corridor"
                value={corridor}
                onChange={(e) => setCorridor(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TRANSIT_CORRIDORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes…' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      ) : (
        /* ─── Profile Display Cards ─────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Academic & Campus Identity Card */}
          <div className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-[#1e2440] rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Academic Profile</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Enrollment
              </span>
            </div>

            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Full Name</dt>
                <dd className="font-bold text-slate-900 dark:text-slate-100">{displayName}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Registered Email</dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-100">{user?.email || 'student@djsanghvi.edu'}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Department</dt>
                <dd className="font-semibold text-teal-600 dark:text-teal-400">{department}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Student Roll / ID</dt>
                <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100">{studentId}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-slate-500 dark:text-slate-400">Campus Destination</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">Vile Parle (West), Mumbai</dd>
              </div>
            </dl>
          </div>

          {/* Commute & Route Preferences Card */}
          <div className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-[#1e2440] rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Train className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Daily Commute Configuration</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Transit Settings
              </span>
            </div>

            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Home / Base Station</dt>
                <dd className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {homeStation}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Primary Corridor</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">{corridor}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">Max Walking Tolerance</dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-100">{walkingTolerance} minutes</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-slate-500 dark:text-slate-400">Railway Concession</dt>
                <dd className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  <BookmarkCheck className="w-3 h-3" />
                  Eligible (Admin Office)
                </dd>
              </div>
            </dl>
          </div>

          {/* Theme & Device Preferences Card */}
          <div className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-[#1e2440] rounded-3xl p-6 space-y-4 shadow-sm md:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>App Theme &amp; Personalization</span>
              </h3>
              <span className="text-xs text-slate-400">Device Local</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Color Appearance</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose between Cream Beige default light mode, dark mode, or system automatic
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 shrink-0">
                {[
                  { id: 'light', label: 'Light', icon: Sun },
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'system', label: 'System', icon: Monitor },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleThemeChange(id)}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold transition-all ${
                      selectedTheme === id
                        ? 'border-[#800020] dark:border-blue-500 bg-[#800020]/10 dark:bg-blue-950/60 text-[#800020] dark:text-blue-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                {lastVerifiedAt
                  ? `Session active and verified on ${new Date(lastVerifiedAt).toLocaleDateString()}`
                  : 'Profile securely stored on this browser device'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline font-bold"
              >
                Change Details →
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
