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
} from 'lucide-react';
import { Alert, Button, Input } from './ui';
import { readThemePreference, writeThemePreference, applyTheme } from '../utils/uiPreferences';
import { readAuthSession, writeAuthSession } from '../utils/authSession';

const TRANSIT_CORRIDORS = [
  'Western Railway (Churchgate - Dahanu)',
  'Central Railway (CSMT - Kalyan)',
  'Harbour Line (CSMT - Panvel)',
  'Metro Line 1 (Versova - Ghatkopar)',
  'Metro Line 2A & 7 (Andheri - Dahisar)',
  'Metro Line 3 (Aqua Line)',
  'BEST Bus Network',
];

/**
 * AccountProfileCard - Student Profile Creation & Management
 *
 * Renders the verified student profile and enables preferences management:
 * - Student badge, initials avatar, name, email, college, and role
 * - Transit corridor & home station preferences
 * - Light / Dark / System theme preference selector
 * - Preserves sign-out flow gated by confirmation dialog
 */
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
  const [collegeName, setCollegeName] = useState(user?.college_name || '');
  const [corridor, setCorridor] = useState(user?.preferred_corridor || 'Western Railway (Churchgate - Dahanu)');
  const [homeStation, setHomeStation] = useState(user?.home_station || 'Vile Parle');
  const [selectedTheme, setSelectedTheme] = useState(() => readThemePreference());
  const [saveSuccess, setSaveSuccess] = useState(false);

  const displayName = user?.full_name || user?.email || '';
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

  const handleSaveProfile = () => {
    const updatedUser = {
      ...user,
      full_name: fullName.trim() || user.full_name,
      college_name: collegeName.trim() || user.college_name,
      preferred_corridor: corridor,
      home_station: homeStation.trim(),
    };

    const session = readAuthSession();
    if (session?.token) {
      writeAuthSession({ token: session.token, user: updatedUser });
    }

    onProfileUpdated?.(updatedUser);
    setSaveSuccess(true);
    setIsEditing(false);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  return (
    <section
      aria-labelledby="account-profile-heading"
      className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm"
    >
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-teal-500 flex items-center justify-center text-white font-black text-lg shadow-md shrink-0"
            aria-hidden="true"
          >
            {initials || <UserRound className="w-7 h-7" />}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="account-profile-heading" className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {user.full_name || 'Student account'}
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                Verified Student
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {user.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsEditing((prev) => !prev)}
            icon={<Edit2 className="w-3.5 h-3.5" />}
          >
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <Alert variant="success" title="Profile updated">
          Your student profile and commute preferences have been updated on this device.
        </Alert>
      )}

      {/* Editing Mode */}
      {isEditing ? (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="edit-full-name"
              label="Full Name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
            <Input
              id="edit-college-name"
              label="College / Institution"
              type="text"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              placeholder="e.g. D.J. Sanghvi College of Engineering"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-corridor"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Primary Transit Corridor
              </label>
              <select
                id="edit-corridor"
                value={corridor}
                onChange={(e) => setCorridor(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {TRANSIT_CORRIDORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="edit-home-station"
              label="Home / Base Station"
              type="text"
              value={homeStation}
              onChange={(e) => setHomeStation(e.target.value)}
              placeholder="e.g. Borivali, Andheri, Thane"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Theme Preference
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Monitor },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleThemeChange(id)}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    selectedTheme === id
                      ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveProfile}
              icon={<Check className="w-4 h-4" />}
            >
              Save Preferences
            </Button>
          </div>
        </div>
      ) : (
        /* Summary Details List */
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-3 min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              College
            </dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium truncate flex items-center gap-1.5 mt-0.5">
              <GraduationCap className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              {user.college_name || 'Not provided'}
            </dd>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-3 min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Role
            </dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium capitalize truncate mt-0.5">
              {user.role || 'student'}
            </dd>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-3 min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Preferred Corridor
            </dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium truncate flex items-center gap-1.5 mt-0.5">
              <Train className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              {corridor}
            </dd>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-3 min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Base Station
            </dt>
            <dd className="text-slate-900 dark:text-slate-200 font-medium truncate mt-0.5">
              {homeStation || 'Not configured'}
            </dd>
          </div>
        </dl>
      )}

      {refreshError && (
        <Alert variant="warning" title="Could not refresh your profile">
          {refreshError} Showing the account details saved on this device.
        </Alert>
      )}

      {/* Verification footer & Sign-out */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
          <KeyRound className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {isRefreshingSession
              ? 'Refreshing your profile…'
              : lastVerifiedAt
                ? `Session verified ${new Date(lastVerifiedAt).toLocaleString()}.`
                : 'Session stored on this device only.'}
          </span>
        </p>
        {onRequestSignOut && (
          <Button
            type="button"
            variant="secondary"
            onClick={onRequestSignOut}
            className="border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 shrink-0"
          >
            Sign out
          </Button>
        )}
      </div>
    </section>
  );
}
