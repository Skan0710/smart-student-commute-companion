import React, { useState } from 'react';
import {
  Navigation,
  GraduationCap,
  Clock,
  Sliders,
  IndianRupee,
  Footprints,
  Sparkles,
  Train,
  Bus,
  Car,
  Zap,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  validateForm,
  validateRequired,
  validateText,
  validateNumber,
  focusFirstInvalid,
} from '../utils/validation';

/** Field → DOM id map so the first invalid control receives focus. */
const FIELD_IDS = {
  origin: 'planner-origin',
  destination: 'planner-destination',
  maxBudgetRupees: 'planner-budget',
};

const COLLEGE_PRESETS = [
  { label: 'IIT Bombay (Powai)', value: 'IIT Bombay Powai' },
  { label: 'VJTI (Matunga)', value: 'VJTI Matunga' },
  { label: 'NMIMS / Mithibai (Vile Parle)', value: 'NMIMS Vile Parle' },
  { label: 'HR / KC (Churchgate)', value: 'HR College Churchgate' },
  { label: 'SPIT / Bhavan (Andheri W)', value: 'SPIT Bhavans Andheri' },
  { label: 'Ruia / Podar (Matunga)', value: 'Ruia College Matunga' },
  { label: "St. Xavier's (Fort)", value: "St. Xavier's College Fort" }
];

const ORIGIN_PRESETS = [
  'Andheri East', 'Borivali West', 'Dadar', 'Bandra', 'Ghatkopar', 'Thane West', 'Vile Parle East', 'Kandivali East'
];

export default function PlannerForm({ formData, setFormData, onPlan, isLoading, onSaveCommute, isCommuteSaved = false }) {
  const [errors, setErrors] = useState({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const clearError = (field) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev));
  };

  /** Shared client-side validation used by both planning and saving. */
  const validatePlanner = () =>
    validateForm(formData, {
      origin: [
        (v) => validateRequired(v, 'Starting area'),
        (v) => validateText(v, { minLength: 2, maxLength: 100, label: 'Starting area' }),
      ],
      destination: [
        (v) => validateRequired(v, 'College destination'),
        (v) => validateText(v, { minLength: 2, maxLength: 100, label: 'College destination' }),
      ],
      maxBudgetRupees: [
        (v) => validateNumber(v, { min: 5, max: 1500, label: 'Max budget' }),
      ],
    });

  const toggleMode = (mode) => {
    const current = [...formData.preferredModes];
    if (current.includes(mode)) {
      if (current.length > 1) {
        setFormData({ ...formData, preferredModes: current.filter(m => m !== mode) });
      }
    } else {
      setFormData({ ...formData, preferredModes: [...current, mode] });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Client-side validation before dispatching a plan request
    const { isValid, errors: validationErrors } = validatePlanner();

    if (!isValid) {
      setErrors(validationErrors);
      if (validationErrors.maxBudgetRupees) {
        setIsFiltersOpen(true);
      }
      focusFirstInvalid(validationErrors, FIELD_IDS);
      return;
    }

    setErrors({});
    onPlan();
  };

  const handleSaveCommute = () => {
    const { isValid, errors: validationErrors } = validatePlanner();

    if (!isValid) {
      setErrors(validationErrors);
      if (validationErrors.maxBudgetRupees) {
        setIsFiltersOpen(true);
      }
      focusFirstInvalid(validationErrors, FIELD_IDS);
      return;
    }

    setErrors({});
    onSaveCommute?.();
  };

  return (
    <div className="bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] rounded-3xl p-6 sm:p-7 shadow-sm transition-colors space-y-5 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5 font-sans">
          <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span>Student Commute Planner</span>
        </h2>
        
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5 font-sans">
        {/* Core Decision 1: Origin */}
        <div>
          <label htmlFor="planner-origin" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between font-sans">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400" aria-hidden="true"></span>
              Starting Area (Neighborhood / Station)
            </span>
          </label>
          <input
            id="planner-origin"
            type="text"
            required
            aria-required="true"
            aria-invalid={errors.origin ? 'true' : 'false'}
            aria-describedby={errors.origin ? 'planner-origin-error' : undefined}
            value={formData.origin}
            onChange={(e) => {
              setFormData({ ...formData, origin: e.target.value });
              clearError('origin');
            }}
            placeholder="e.g. Andheri East, Borivali, Dadar..."
            className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-2xl px-4 py-3 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none transition-all font-sans ${
              errors.origin
                ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
            }`}
          />
          {errors.origin && (
            <p id="planner-origin-error" className="mt-1.5 text-xs text-rose-500 dark:text-rose-400 font-sans" role="alert">
              {errors.origin}
            </p>
          )}
          {/* Quick origin suggestions */}
          <div className="flex flex-wrap gap-2 mt-2.5">
            {ORIGIN_PRESETS.slice(0, 5).map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, origin: area });
                  clearError('origin');
                }}
                className={`text-xs px-3 py-1.5 rounded-xl transition-all font-sans ${
                  formData.origin === area
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800 font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/60'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Core Decision 2: Destination */}
        <div>
          <label htmlFor="planner-destination" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between font-sans">
            <span className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              College Destination
            </span>
          </label>
          <input
            id="planner-destination"
            type="text"
            required
            aria-required="true"
            aria-invalid={errors.destination ? 'true' : 'false'}
            aria-describedby={errors.destination ? 'planner-destination-error' : undefined}
            value={formData.destination}
            onChange={(e) => {
              setFormData({ ...formData, destination: e.target.value });
              clearError('destination');
            }}
            placeholder="e.g. IIT Bombay, VJTI, NMIMS..."
            className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-2xl px-4 py-3 text-base text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none transition-all font-sans ${
              errors.destination
                ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
            }`}
          />
          {errors.destination && (
            <p id="planner-destination-error" className="mt-1.5 text-xs text-rose-500 dark:text-rose-400 font-sans" role="alert">
              {errors.destination}
            </p>
          )}
          {/* Quick College presets */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COLLEGE_PRESETS.map((col) => (
              <button
                key={col.value}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, destination: col.value });
                  clearError('destination');
                }}
                className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${
                  formData.destination === col.value
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700/60'
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Core Decision 3: Desired Arrival Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label
              htmlFor="planner-arrival-time"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              Desired Arrival Time
            </label>
            <input
              id="planner-arrival-time"
              type="time"
              value={formData.desiredArrivalTime}
              onChange={(e) => setFormData({ ...formData, desiredArrivalTime: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="planner-preference"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              Route Priority
            </label>
            <select
              id="planner-preference"
              value={formData.preference}
              onChange={(e) => setFormData({ ...formData, preference: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="balanced">Balanced (Optimal Tradeoff)</option>
              <option value="fastest">Fastest (Earliest Arrival)</option>
              <option value="cheapest">Cheapest (Lowest Fare)</option>
              <option value="rain-safe">Rain-Safe (Sheltered / Low Walk)</option>
            </select>
          </div>
        </div>

        {/* Progressive Disclosure: Filters & Preferences Accordion */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            aria-expanded={isFiltersOpen}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Filters &amp; Preferences</span>
            </span>
            <span className="flex items-center gap-2 text-[11px] font-normal text-slate-500 dark:text-slate-400">
              <span>₹{formData.maxBudgetRupees || 250} max · {formData.preferredModes?.length || 5} modes · {formData.walkingToleranceMinutes || 15}m walk</span>
              {isFiltersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {isFiltersOpen && (
            <div className="mt-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4 animate-fade-in">
              {/* Transportation Mode Toggles */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Allowed Transportation Modes
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { id: 'train', label: 'Train', icon: Train },
                    { id: 'metro', label: 'Metro', icon: Zap },
                    { id: 'bus', label: 'BEST Bus', icon: Bus },
                    { id: 'auto', label: 'Auto/Cab', icon: Car },
                    { id: 'walk', label: 'Walk', icon: Footprints }
                  ].map(({ id, label, icon: Icon }) => {
                    const active = formData.preferredModes.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleMode(id)}
                        aria-pressed={active}
                        aria-label={`${label} — ${active ? 'enabled' : 'disabled'}`}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                          active
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800 font-semibold shadow-xs'
                            : 'bg-white dark:bg-[#0a0c16] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mb-1 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} aria-hidden="true" />
                        <span className="text-[10px] leading-tight" aria-hidden="true">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Walking Tolerance & Budget */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Footprints className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      Max Walking
                    </span>
                    <span className="text-teal-700 dark:text-teal-400 font-bold">{formData.walkingToleranceMinutes} mins</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="5"
                    value={formData.walkingToleranceMinutes}
                    onChange={(e) => setFormData({ ...formData, walkingToleranceMinutes: parseInt(e.target.value) })}
                    aria-label={`Maximum walking tolerance: ${formData.walkingToleranceMinutes} minutes`}
                    aria-valuemin={5}
                    aria-valuemax={30}
                    aria-valuenow={formData.walkingToleranceMinutes}
                    className="w-full accent-teal-600 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer h-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    <label htmlFor="planner-budget" className="flex items-center gap-1.5 cursor-pointer">
                      <IndianRupee className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                      Max Budget
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-amber-800 dark:text-amber-400 text-xs font-mono font-bold">₹</span>
                      <input
                        id="planner-budget"
                        type="number"
                        min="5"
                        max="1500"
                        step="5"
                        aria-invalid={errors.maxBudgetRupees ? 'true' : 'false'}
                        aria-describedby={errors.maxBudgetRupees ? 'planner-budget-error' : undefined}
                        value={formData.maxBudgetRupees}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setFormData({ ...formData, maxBudgetRupees: isNaN(val) ? 0 : val });
                          clearError('maxBudgetRupees');
                        }}
                        className="w-16 bg-white dark:bg-[#0a0c16] border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-right font-bold text-amber-800 dark:text-amber-400 text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="600"
                    step="10"
                    aria-label={`Maximum budget: ₹${formData.maxBudgetRupees}`}
                    value={Math.min(600, formData.maxBudgetRupees || 10)}
                    onChange={(e) => setFormData({ ...formData, maxBudgetRupees: parseInt(e.target.value, 10) })}
                    className="w-full accent-amber-500 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer h-2"
                  />
                  {errors.maxBudgetRupees && (
                    <p id="planner-budget-error" className="mt-1 text-xs text-rose-500 dark:text-rose-400" role="alert">
                      {errors.maxBudgetRupees}
                    </p>
                  )}
                  {/* Quick Budget Chips */}
                  <div className="flex items-center gap-1 mt-1.5 overflow-x-auto pb-0.5">
                    {[25, 50, 100, 200, 350, 500].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFormData({ ...formData, maxBudgetRupees: preset })}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                          formData.maxBudgetRupees === preset
                            ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 font-bold'
                            : 'bg-white dark:bg-[#0a0c16] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        ₹{preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit Action — Enhanced with VengeanceUI Generation & Shine aesthetics */}
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className="group relative w-full min-h-[52px] py-3.5 px-6 rounded-2xl font-bold text-base bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-500/25 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-50 mt-3 overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 border border-white/20 font-sans"
        >
          {/* Glowing edge sweep */}
          <span
            className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent"
            aria-hidden="true"
          />
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span className="relative z-10 tracking-wide">Calculating Multi-Modal Commute...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-white fill-white relative z-10 group-hover:rotate-12 transition-transform" />
              <span className="relative z-10 tracking-wide">Plan My Commute</span>
            </>
          )}
        </button>

        {/* Save this commute → "My Commutes" (persisted on this device) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Keep this setup for one-tap planning from{' '}
            <strong className="text-slate-700 dark:text-slate-300">My Commutes</strong>.
          </p>
          <button
            type="button"
            onClick={handleSaveCommute}
            disabled={isCommuteSaved || isLoading}
            aria-pressed={isCommuteSaved}
            title={
              isCommuteSaved
                ? 'This commute is already saved in My Commutes'
                : 'Save this commute setup on this device'
            }
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
          >
            {isCommuteSaved ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-lg px-2 py-0.5">
                  Saved
                </span>
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span className="text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 transition-colors">
                  Save this commute
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
