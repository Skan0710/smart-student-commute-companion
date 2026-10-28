import React, { useEffect, useState } from 'react';
import {
  Users,
  Target,
  Plus,
  MapPin,
  Clock,
  Car,
  ShieldCheck,
  Search,
  TrendingUp
} from 'lucide-react';
import {
  loadGoals,
  createStudentGoal,
  loadSharedTravel,
  setSharedTravelConsent,
  discoverJourneys,
  createSharedJourney,
  requestToJoinJourney,
  acceptJourney,
  declineJourney,
  leaveJourney
} from '../services/communityGoals';
import useAsyncResource from '../hooks/useAsyncResource';
import { formatStatus } from '../utils/formatters';
import {
  Tabs,
  TabPanel,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SampleDataBanner,
  EntityFormModal,
  Input
} from '../components/ui';

const CARD_SURFACE =
  'bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.12)] dark:shadow-none';

const TRANSPORT_MODE_OPTIONS = [
  { value: 'train', label: 'Local train' },
  { value: 'metro', label: 'Metro' },
  { value: 'bus', label: 'BEST bus' },
  { value: 'auto', label: 'Auto' },
  { value: 'shared_auto', label: 'Shared auto' },
  { value: 'walk', label: 'Walk' },
];

const FLEX_OPTIONS = [
  { value: '5', label: '± 5 minutes' },
  { value: '10', label: '± 10 minutes' },
  { value: '15', label: '± 15 minutes' },
  { value: '30', label: '± 30 minutes' },
];

const pad = (n) => String(n).padStart(2, '0');
const localDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function PrimaryButton({ onClick, icon: Icon, children, tone = 'violet', disabled, title }) {
  const tones = {
    violet: 'bg-violet-700 hover:bg-violet-600 focus-visible:ring-violet-500',
    blue: 'bg-blue-700 hover:bg-blue-600 focus-visible:ring-blue-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl ${tones[tone]} text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950`}
    >
      {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

/** One shared journey, with whatever actions the caller supplies. */
function JourneyCard({ journey, badge, children }) {
  return (
    <li className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4 flex flex-col justify-between hover:border-blue-400 transition-all`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
            {journey.mode}
          </span>
          {badge || (
            Number.isFinite(journey.seatsAvailable) && (
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{journey.seatsAvailable} {journey.seatsAvailable === 1 ? 'seat' : 'seats'} open</span>
              </span>
            )
          )}
        </div>

        <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">{journey.title}</h3>

        <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />
            <span>From: <strong>{journey.origin}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>To: <strong>{journey.destination}</strong></span>
          </div>
          {(journey.departureTime || journey.departureDate) && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-800 shrink-0" aria-hidden="true" />
              <span>Departure: {[journey.departureDate, journey.departureTime].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          {journey.meetingPoint && (
            <div className="text-slate-600 dark:text-slate-400">Meet at: {journey.meetingPoint}</div>
          )}
          {journey.matchExplanation && (
            <div className="text-slate-600 dark:text-slate-400">{journey.matchExplanation}</div>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-400">Organized by {journey.organizer}</span>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </li>
  );
}

function CardActionButton({ onClick, disabled, tone = 'blue', children, title }) {
  const tones = {
    blue: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 focus-visible:ring-blue-500',
    neutral: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-slate-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3.5 py-1.5 rounded-xl ${tones[tone]} text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2`}
    >
      {children}
    </button>
  );
}

/**
 * CommunityGoalsPage (EF Combined)
 * Student goals & milestones, and voluntary shared-travel coordination.
 *
 * Shared travel is opt-in: a signed-in student must explicitly consent before
 * journeys, discovery and meeting points are available. Guests see labelled
 * sample content.
 */
export default function CommunityGoalsPage({ onNavigate, onNotify }) {
  const [activeTab, setActiveTab] = useState('goals'); // 'goals' | 'sharedtravel'
  const [openForm, setOpenForm] = useState(null); // 'goal' | 'journey' | null

  const goalsRes = useAsyncResource(loadGoals, {
    errorMessage: 'Unable to load your goals. Please check your connection and try again.',
  });
  const travelRes = useAsyncResource(loadSharedTravel, {
    errorMessage: 'Unable to load shared travel. Please check your connection and try again.',
  });

  // Consent
  const [consentChecked, setConsentChecked] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);

  // Discovery of other students' journeys
  const [search, setSearch] = useState({ originArea: '', destinationArea: '' });
  const [matches, setMatches] = useState(null); // null = not searched yet
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Which journey action is in flight (disables just that card's buttons)
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    goalsRes.load();
    travelRes.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goals = goalsRes.data?.goals || [];
  const travel = travelRes.data;
  const isSampleGoals = Boolean(goalsRes.data?.isSample);
  const isSampleTravel = Boolean(travel?.isSample);
  const sharingEnabled = Boolean(travel?.sharingEnabled);
  const myJourneyCount = (travel?.active?.length || 0) + (travel?.pending?.length || 0);

  const runSearch = async (query = search) => {
    setIsSearching(true);
    setSearchError(null);
    try {
      setMatches(await discoverJourneys(query));
    } catch (err) {
      setSearchError(err?.message || 'Unable to search for journeys right now.');
    } finally {
      setIsSearching(false);
    }
  };

  // Once sharing is on, show open journeys without making the student search first
  useEffect(() => {
    if (sharingEnabled && matches === null && !isSearching) runSearch({ originArea: '', destinationArea: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingEnabled]);

  const handleConsent = async (enabled) => {
    setIsSavingConsent(true);
    try {
      await setSharedTravelConsent(enabled);
      setMatches(null);
      setConsentChecked(false);
      await travelRes.load();
      onNotify?.(enabled ? 'Shared travel is on. You can turn it off anytime.' : 'Shared travel is off.', 'success');
    } catch (err) {
      onNotify?.(err?.message || 'Could not update your shared travel setting.', 'error');
    } finally {
      setIsSavingConsent(false);
    }
  };

  const runJourneyAction = async (key, action, successMessage) => {
    setBusyKey(key);
    try {
      await action();
      await travelRes.load();
      if (matches !== null) await runSearch();
      onNotify?.(successMessage, 'success');
    } catch (err) {
      onNotify?.(err?.message || 'That did not work. Please try again.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const tabs = [
    { id: 'goals', label: 'Goals & Milestones', icon: Target, count: goals.length },
    { id: 'sharedtravel', label: 'Shared Travel Journeys', icon: Users, count: myJourneyCount },
  ];

  // ── Forms ─────────────────────────────────────────────────────────────────
  const goalFields = [
    { name: 'title', label: 'Goal title', required: true, maxLength: 150, placeholder: 'e.g. Master graph theory problem sets' },
    { name: 'description', label: 'Description (optional)', type: 'textarea', rows: 2, maxLength: 2000 },
    {
      name: 'targetDate',
      label: 'Target date (optional)',
      type: 'date',
      validate: (value) => (value && new Date(`${value}T23:59:00`).getTime() < Date.now() ? 'Choose a date in the future.' : null),
    },
  ];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const journeyFields = [
    { name: 'title', label: 'Journey title', required: true, maxLength: 100, placeholder: 'e.g. Andheri to Powai morning pool' },
    { name: 'originArea', label: 'From (area)', required: true, half: true, maxLength: 100, placeholder: 'e.g. Andheri East', hint: 'Area only — never a home address.' },
    { name: 'destinationArea', label: 'To (area)', required: true, half: true, maxLength: 100, placeholder: 'e.g. Vile Parle' },
    { name: 'date', label: 'Date', type: 'date', required: true, half: true },
    {
      name: 'time',
      label: 'Departure time',
      type: 'time',
      required: true,
      half: true,
      validate: (value, values) =>
        values.date && value && new Date(`${values.date}T${value}`).getTime() <= Date.now() ? 'Choose a departure time in the future.' : null,
    },
    { name: 'flexMinutes', label: 'Flexibility', type: 'select', options: FLEX_OPTIONS, half: true },
    { name: 'transportMode', label: 'Mode', type: 'select', options: TRANSPORT_MODE_OPTIONS, half: true },
    { name: 'maxParticipants', label: 'Maximum students', type: 'number', min: 2, max: 10, step: 1, half: true },
  ];

  return (
    <div className="max-w-[1650px] mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* Top Banner & Tab Controls */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl ${CARD_SURFACE}`}>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Community &amp; Student Goals
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
            Set and track milestone targets, pair with fellow students for shared rides, and coordinate campus commutes.
          </p>
        </div>

        <Tabs
          idPrefix="community"
          ariaLabel="Community sections"
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Goals & Milestones */}
      {activeTab === 'goals' && (
        <TabPanel idPrefix="community" tabId="goals" className="space-y-6">
          {goalsRes.isLoading && <ListSkeleton rows={3} label="Loading your goals" />}

          {goalsRes.loadError && (
            <ErrorState
              headingLevel={2}
              title="Goals unavailable"
              message={goalsRes.loadError}
              onRetry={goalsRes.load}
              retryLabel="Reload"
            />
          )}

          {goalsRes.data && (
            <>
              {isSampleGoals && (
                <SampleDataBanner onSignIn={() => onNavigate?.('account')} what="goals and milestones" />
              )}

              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-violet-700 dark:text-violet-400" aria-hidden="true" />
                  <span>Active milestones &amp; goals</span>
                </h2>
                {!isSampleGoals && <PrimaryButton icon={Plus} onClick={() => setOpenForm('goal')}>Add goal</PrimaryButton>}
              </div>

              {goals.length === 0 ? (
                <EmptyState
                  headingLevel={3}
                  icon={<Target className="w-6 h-6" aria-hidden="true" />}
                  title="No goals yet"
                  description="Set a goal — a grade target, a project, a habit — and track your progress toward it."
                  action={<PrimaryButton icon={Plus} onClick={() => setOpenForm('goal')}>Add your first goal</PrimaryButton>}
                />
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
                  {goals.map((goal) => (
                    <li
                      key={goal.id}
                      className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4 hover:border-violet-400 dark:hover:border-violet-500 transition-all flex flex-col justify-between`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300">
                            {goal.category || formatStatus(goal.status)}
                          </span>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{goal.targetDate}</span>
                        </div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">{goal.title}</h3>
                        {goal.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{goal.description}</p>
                        )}
                      </div>

                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-600 dark:text-slate-400">Progress</span>
                          <span className="text-violet-700 dark:text-violet-400 tabular-nums">{goal.progress}%</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Progress for ${goal.title}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={goal.progress}
                          className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                        >
                          <div
                            className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${goal.progress}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </TabPanel>
      )}

      {/* Shared Travel */}
      {activeTab === 'sharedtravel' && (
        <TabPanel idPrefix="community" tabId="sharedtravel" className="space-y-6">
          {travelRes.isLoading && <ListSkeleton rows={3} label="Loading shared travel" />}

          {travelRes.loadError && (
            <ErrorState
              headingLevel={2}
              title="Shared travel unavailable"
              message={travelRes.loadError}
              onRetry={travelRes.load}
              retryLabel="Reload"
            />
          )}

          {travel && (
            <>
              {isSampleTravel && (
                <SampleDataBanner onSignIn={() => onNavigate?.('account')} what="shared journeys" />
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Car className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                    <span>Student commute pools &amp; shared journeys</span>
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Students travelling along common Mumbai routes to college. Voluntary, pseudonymous, areas only.
                  </p>
                </div>
                {sharingEnabled && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleConsent(false)}
                      disabled={isSavingConsent}
                      className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    >
                      Turn off sharing
                    </button>
                    <PrimaryButton tone="blue" icon={Plus} onClick={() => setOpenForm('journey')}>
                      Create journey
                    </PrimaryButton>
                  </div>
                )}
              </div>

              {/* Opt-in gate for signed-in students */}
              {!isSampleTravel && !sharingEnabled && (
                <section className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4 max-w-2xl`} aria-label="Turn on shared travel">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Shared travel is off</h3>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                    <li>It is voluntary and stays off until you turn it on.</li>
                    <li>Other students only see a pseudonym — never your name or contact details.</li>
                    <li>Only coarse areas like &ldquo;Andheri East&rdquo; are shared — never an address or live location.</li>
                    <li>You can leave any journey, or turn sharing off, at any time.</li>
                  </ul>
                  <label className="flex items-start gap-3 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(event) => setConsentChecked(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-400 text-blue-700 focus:ring-blue-500"
                    />
                    <span>I understand, and I voluntarily agree to take part in shared travel.</span>
                  </label>
                  <PrimaryButton
                    tone="blue"
                    onClick={() => handleConsent(true)}
                    disabled={!consentChecked || isSavingConsent}
                  >
                    {isSavingConsent ? 'Turning on…' : 'Turn on shared travel'}
                  </PrimaryButton>
                </section>
              )}

              {/* Guest sample journeys */}
              {isSampleTravel && (
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
                  {travel.active.map((journey) => (
                    <JourneyCard key={journey.id} journey={journey}>
                      <CardActionButton disabled title="Sign in to join journeys">Request to join</CardActionButton>
                    </JourneyCard>
                  ))}
                </ul>
              )}

              {/* Signed in & opted in */}
              {sharingEnabled && (
                <>
                  {travel.pending.length > 0 && (
                    <section className="space-y-3" aria-label="Pending journeys">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Waiting for your confirmation</h3>
                      <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
                        {travel.pending.map((journey) => (
                          <JourneyCard
                            key={journey.id}
                            journey={journey}
                            badge={<span className="text-xs font-bold text-amber-800 dark:text-amber-300">Pending</span>}
                          >
                            <CardActionButton
                              tone="neutral"
                              disabled={busyKey === `decline-${journey.id}`}
                              onClick={() => runJourneyAction(`decline-${journey.id}`, () => declineJourney(journey.id), 'Declined.')}
                            >
                              Decline
                            </CardActionButton>
                            <CardActionButton
                              disabled={busyKey === `accept-${journey.id}`}
                              onClick={() => runJourneyAction(`accept-${journey.id}`, () => acceptJourney(journey.id), "You're in! See you there.")}
                            >
                              Accept
                            </CardActionButton>
                          </JourneyCard>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="space-y-3" aria-label="Your journeys">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Your journeys</h3>
                    {travel.active.length === 0 ? (
                      <EmptyState
                        headingLevel={4}
                        icon={<Car className="w-6 h-6" aria-hidden="true" />}
                        title="You haven't joined a journey yet"
                        description="Create one for your usual route, or request to join one below."
                        action={<PrimaryButton tone="blue" icon={Plus} onClick={() => setOpenForm('journey')}>Create journey</PrimaryButton>}
                      />
                    ) : (
                      <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
                        {travel.active.map((journey) => (
                          <JourneyCard
                            key={journey.id}
                            journey={journey}
                            badge={
                              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                {journey.isOrganizer ? "You're organizing" : "You're in"}
                              </span>
                            }
                          >
                            {!journey.isOrganizer && (
                              <CardActionButton
                                tone="neutral"
                                disabled={busyKey === `leave-${journey.id}`}
                                onClick={() => runJourneyAction(`leave-${journey.id}`, () => leaveJourney(journey.id), 'You left the journey.')}
                              >
                                Leave
                              </CardActionButton>
                            )}
                          </JourneyCard>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="space-y-3" aria-label="Find journeys">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Find a journey to join</h3>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        runSearch();
                      }}
                      className="flex flex-col sm:flex-row sm:items-end gap-3"
                    >
                      <Input
                        label="From (area)"
                        value={search.originArea}
                        onChange={(event) => setSearch((prev) => ({ ...prev, originArea: event.target.value }))}
                        placeholder="e.g. Borivali"
                        containerClassName="flex-1"
                      />
                      <Input
                        label="To (area)"
                        value={search.destinationArea}
                        onChange={(event) => setSearch((prev) => ({ ...prev, destinationArea: event.target.value }))}
                        placeholder="e.g. Vile Parle"
                        containerClassName="flex-1"
                      />
                      <button
                        type="submit"
                        disabled={isSearching}
                        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                      >
                        <Search className="w-4 h-4" aria-hidden="true" />
                        <span>{isSearching ? 'Searching…' : 'Search'}</span>
                      </button>
                    </form>

                    {searchError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{searchError}</p>}

                    {matches !== null && matches.length === 0 && !isSearching && (
                      <p role="status" className="text-sm text-slate-600 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5">
                        No open journeys match yet. Create one and others can find it.
                      </p>
                    )}

                    {matches !== null && matches.length > 0 && (
                      <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
                        {matches.map((journey) => (
                          <JourneyCard key={journey.id} journey={journey}>
                            <CardActionButton
                              disabled={journey.seatsAvailable === 0 || busyKey === `join-${journey.id}`}
                              onClick={() =>
                                runJourneyAction(
                                  `join-${journey.id}`,
                                  () => requestToJoinJourney(journey.id),
                                  'Join request sent — the organizer will confirm.'
                                )
                              }
                            >
                              {journey.seatsAvailable === 0 ? 'Full' : 'Request to join'}
                            </CardActionButton>
                          </JourneyCard>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}

              {/* Meeting points */}
              {(isSampleTravel || sharingEnabled) && travel.meetingPoints.length > 0 && (
                <section className={`p-6 rounded-3xl ${CARD_SURFACE} space-y-4`} aria-label="Safe campus meeting points">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    <span>Suggested public meeting points</span>
                  </h3>
                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 list-none">
                    {travel.meetingPoints.map((point) => (
                      <li key={point.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                        <div className="font-bold text-xs text-slate-900 dark:text-white">{point.name}</div>
                        {point.landmark && <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{point.landmark}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </TabPanel>
      )}

      <EntityFormModal
        isOpen={openForm === 'goal'}
        onClose={() => setOpenForm(null)}
        title="Create a goal"
        icon={<Target className="w-5 h-5 text-violet-700 dark:text-violet-400" />}
        fields={goalFields}
        submitLabel="Save goal"
        onSubmit={async (values) => {
          await createStudentGoal({
            title: values.title.trim(),
            description: values.description?.trim() || undefined,
            targetDate: values.targetDate ? new Date(`${values.targetDate}T23:59:00`).getTime() : null,
          });
          await goalsRes.load();
          onNotify?.('Goal saved.', 'success');
        }}
      />

      <EntityFormModal
        isOpen={openForm === 'journey'}
        onClose={() => setOpenForm(null)}
        title="Create a shared journey"
        icon={<Car className="w-5 h-5 text-blue-700 dark:text-blue-400" />}
        description="Other students who opted in can find this journey and ask to join. Use areas, not addresses."
        fields={journeyFields}
        initialValues={{
          date: localDateInput(tomorrow),
          time: '08:30',
          flexMinutes: '15',
          transportMode: 'train',
          maxParticipants: 4,
        }}
        submitLabel="Create journey"
        onSubmit={async (values) => {
          await createSharedJourney({
            title: values.title.trim(),
            originArea: values.originArea.trim(),
            destinationArea: values.destinationArea.trim(),
            departureAt: new Date(`${values.date}T${values.time}`).getTime(),
            flexMinutes: Number(values.flexMinutes),
            transportMode: values.transportMode,
            maxParticipants: Number(values.maxParticipants),
          });
          await travelRes.load();
          onNotify?.('Journey created.', 'success');
        }}
      />
    </div>
  );
}
