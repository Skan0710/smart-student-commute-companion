import React, { useState, useEffect, useRef } from 'react';
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
  X,
  Camera,
  Trash2,
  Upload
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
  const [profilePicture, setProfilePicture] = useState(user?.profile_picture || user?.avatar_url || '');
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
  const fileInputRef = useRef(null);

  // Synchronize theme state whenever theme preference changes across the app
  useEffect(() => {
    const syncTheme = () => {
      setSelectedTheme(readThemePreference());
    };
    window.addEventListener('app-theme-change', syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      window.removeEventListener('app-theme-change', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  // Update local fields when user prop updates
  useEffect(() => {
    if (user) {
      if (user.full_name) setFullName(user.full_name);
      if (user.profile_picture || user.avatar_url) {
        setProfilePicture(user.profile_picture || user.avatar_url);
      }
      if (user.college_name) setCollegeName(user.college_name);
      if (user.department) setDepartment(user.department);
      if (user.student_id || user.roll_no) setStudentId(user.student_id || user.roll_no);
      if (user.preferred_corridor) setCorridor(user.preferred_corridor);
      if (user.home_station) setHomeStation(user.home_station);
      if (user.max_walking_minutes) setWalkingTolerance(user.max_walking_minutes);
    }
  }, [user]);

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

  /**
   * Process and compress image file upload (downscaled to max 280x280 for fast instant storage)
   */
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSaveError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image file is too large. Please select an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 280;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setProfilePicture(dataUrl);

        // Auto-save photo change immediately
        const updatedUser = {
          ...(user || {}),
          profile_picture: dataUrl
        };
        updateUserProfile(user?.id, updatedUser).then((res) => {
          onProfileUpdated?.(res);
          window.dispatchEvent(new CustomEvent('auth-session-change', { detail: res }));
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }).catch(() => {});
      };
      img.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (e) => {
    e?.stopPropagation();
    setProfilePicture('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    const updatedUser = {
      ...(user || {}),
      profile_picture: null
    };
    updateUserProfile(user?.id, updatedUser).then((res) => {
      onProfileUpdated?.(res);
      window.dispatchEvent(new CustomEvent('auth-session-change', { detail: res }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }).catch(() => {});
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
      profile_picture: profilePicture || null,
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
      window.dispatchEvent(new CustomEvent('auth-session-change', { detail: updatedUser }));
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
      {/* Hidden file input for avatar uploading */}
      <input
        ref={fileInputRef}
        id="profile-picture-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handlePhotoUpload}
        className="sr-only"
        aria-label="Upload student profile picture"
      />

      {/* ─── Digital Student Campus ID Card ────────────────────────────── */}
      <div className="relative rounded-3xl bg-[#800020] dark:bg-[#0c0f1e] text-white p-6 sm:p-8 shadow-md overflow-hidden border border-[#800020] dark:border-white/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5 min-w-0">
            {/* Student Avatar with Photo Upload & Removal Controls */}
            <div className="relative shrink-0 group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="block relative rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 overflow-hidden"
                title="Click to add or change profile picture"
                aria-label="Change profile picture"
              >
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-900 border border-white/20 dark:border-white/20 overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-black text-2xl sm:text-3xl tracking-wider">
                      {initials || <UserRound className="w-10 h-10 text-white/90" />}
                    </div>
                  )}
                </div>

                {/* Hover overlay with camera indicator and remove option */}
                <div className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200 gap-1.5 p-1 select-none">
                  <div className="flex items-center gap-1 text-white">
                    <Camera className="w-4 h-4 text-white drop-shadow" />
                    <span className="text-[11px] font-bold drop-shadow">Change</span>
                  </div>
                  {profilePicture && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleRemovePhoto}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRemovePhoto(e); }}
                      title="Remove profile picture"
                      className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-[10px] font-bold text-white shadow-xs transition-colors"
                      aria-label="Remove profile picture"
                    >
                      Remove
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Student Identity Information */}
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  id="account-profile-heading"
                  className="text-xl sm:text-2xl font-black text-white tracking-tight truncate drop-shadow-sm"
                >
                  {displayName}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-400/25 text-emerald-100 border border-emerald-300/40 backdrop-blur-md shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                  Verified Student
                </span>
              </div>

              <p className="text-xs sm:text-sm text-white/95 font-medium flex items-center gap-2 truncate">
                <Building className="w-4 h-4 text-amber-300 dark:text-sky-300 shrink-0 drop-shadow-sm" />
                <span className="drop-shadow-sm">{collegeName}</span>
              </p>

              <div className="flex items-center gap-3 text-xs text-white/90 flex-wrap pt-0.5">
                <span className="flex items-center gap-1.5 text-white/90 font-medium">
                  <Mail className="w-3.5 h-3.5 text-white/75" />
                  {user?.email || 'student@djsanghvi.edu'}
                </span>
                <span className="text-white/40">•</span>
                <span className="text-teal-200 dark:text-[#ccff00] font-bold">{department}</span>
                {studentId && (
                  <>
                    <span className="text-white/40">•</span>
                    <span className="font-mono text-white font-semibold px-2.5 py-0.5 rounded-lg bg-black/30 dark:bg-white/15 border border-white/20 shadow-inner">
                      ID: {studentId}
                    </span>
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
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-bold border border-white/35 backdrop-blur-md transition-all shadow-md active:scale-95"
            >
              {isEditing ? (
                <>
                  <X className="w-4 h-4 text-white" />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-4 h-4 text-white" />
                  <span>Edit Profile</span>
                </>
              )}
            </button>
            {onRequestSignOut && (
              <button
                type="button"
                onClick={onRequestSignOut}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-600/35 hover:bg-rose-600/50 text-white text-xs sm:text-sm font-bold border border-rose-300/40 backdrop-blur-md transition-all shadow-md active:scale-95"
                title="Sign out of student profile"
              >
                <LogOut className="w-4 h-4 text-rose-200" />
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
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-white/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          <div className="border-b border-slate-100 dark:border-white/12 pb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Edit Student Information</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Update your photo, name, department, campus travel corridor, and base station.
            </p>
          </div>

          {/* Profile Picture Upload Section inside Form */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/15 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-white/20 overflow-hidden flex items-center justify-center shrink-0">
              {profilePicture ? (
                <img src={profilePicture} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-slate-500 dark:text-slate-400">{initials}</span>
              )}
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Profile Photo
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload a custom picture from your device. Supported formats: JPG, PNG, WEBP.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{profilePicture ? 'Change Photo' : 'Upload Photo'}</span>
              </button>
              {profilePicture && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
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
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TRANSIT_CORRIDORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/12">
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
          <div className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-white/20 rounded-3xl p-6 space-y-4 shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/12 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Academic Profile</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Enrollment
              </span>
            </div>

            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Full Name</dt>
                <dd className="font-bold text-slate-950 dark:text-white">{displayName}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Registered Email</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">{user?.email || 'student@djsanghvi.edu'}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Department</dt>
                <dd className="font-bold text-teal-700 dark:text-teal-300">{department}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Student Roll / ID</dt>
                <dd className="font-mono font-bold text-slate-950 dark:text-white px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10">{studentId}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Campus Destination</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">Vile Parle (West), Mumbai</dd>
              </div>
            </dl>
          </div>

          {/* Commute & Route Preferences Card */}
          <div className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-white/20 rounded-3xl p-6 space-y-4 shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/12 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Train className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Daily Commute Configuration</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                Transit Settings
              </span>
            </div>

            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Home / Base Station</dt>
                <dd className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {homeStation}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Primary Corridor</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{corridor}</dd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/10">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Max Walking Tolerance</dt>
                <dd className="font-bold text-slate-950 dark:text-white">{walkingTolerance} minutes</dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-slate-600 dark:text-slate-300 font-medium">Railway Concession</dt>
                <dd className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shadow-sm">
                  <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Eligible (Admin Office)
                </dd>
              </div>
            </dl>
          </div>

          {/* Theme & Device Preferences Card */}
          <div className="bg-white dark:bg-[#0c0f1e] border border-[#d8d3c5] dark:border-white/20 rounded-3xl p-6 space-y-4 shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] md:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/12 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#800020] dark:text-[#ccff00]" />
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
                ].map(({ id, label, icon: Icon }) => {
                  const isEffectiveActive =
                    selectedTheme === id ||
                    (selectedTheme === 'system' && id === (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'));

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleThemeChange(id)}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold transition-all ${
                        selectedTheme === id
                          ? 'border-[#800020] dark:border-blue-500 bg-[#800020]/10 dark:bg-blue-950/60 text-[#800020] dark:text-blue-300 shadow-xs'
                          : 'border-slate-200 dark:border-white/20 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-white/12 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
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
