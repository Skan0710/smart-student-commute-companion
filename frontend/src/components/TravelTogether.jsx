import React, { useState } from 'react';
import { Users, Plus, Clock, MapPin, GraduationCap, Check, ShieldCheck } from 'lucide-react';
import { EmptyState, Badge, DataCard, MetaRow, MetaList } from './ui';

export default function TravelTogether({ groups = [], onJoinGroup, onOpenCreateGroup }) {
  const [joiningId, setJoiningId] = useState(null);

  const handleJoin = async (groupId) => {
    setJoiningId(groupId);
    try {
      await onJoinGroup(groupId);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-white/20 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-xs">
            <Users className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-slate-950 dark:text-white tracking-tight">
              TRAVEL TOGETHER (COMMUTE GROUPS)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mt-0.5">
              Safe student grouping for auto-pooling and local train buddies
            </p>
          </div>
        </div>

        <button
          onClick={onOpenCreateGroup}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold bg-[#800020] hover:bg-[#68001a] dark:bg-[#0047ff] dark:hover:bg-[#1e5cff] text-white shadow-md transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>New Commute Group</span>
        </button>
      </div>

      {/* Safety & Consent Banner */}
      <div className="bg-emerald-50 dark:bg-slate-950/80 border border-emerald-300 dark:border-emerald-500/40 rounded-2xl p-4 sm:p-5 text-slate-800 dark:text-slate-200 flex items-start gap-3.5 shadow-xs">
        <ShieldCheck className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm sm:text-base text-emerald-950 dark:text-emerald-300">
            Privacy-Preserving &amp; Consent-Grounded
          </p>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
            Only general station areas, public meeting hubs, and departure time windows are shared. Home addresses are never requested or stored. You can withdraw your participation consent anytime.
          </p>
        </div>
      </div>

      {/* Suggested Public Meeting Points Pill Banner */}
      <div className="bg-slate-50 dark:bg-[#0a0c16]/80 border border-slate-200 dark:border-white/20 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Verified Transit Meeting Points
          </span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Public hubs only</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Vile Parle Station East Gate', 'Andheri Metro Concourse', 'D.J. Sanghvi Main Entry', 'Dadar Central FOB', 'Bandra Skywalk Deck'].map((pt) => (
            <span
              key={pt}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/15 text-slate-800 dark:text-slate-200 shadow-2xs"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
              {pt}
            </span>
          ))}
        </div>
      </div>

      {/* Groups List */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
          title="No commute groups currently active"
          description="Be the first to create a safe student auto-pool or transit travel buddy group for your college route!"
          action={
            <button
              onClick={onOpenCreateGroup}
              className="touch-target px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold bg-[#800020] hover:bg-[#68001a] dark:bg-[#0047ff] dark:hover:bg-[#1e5cff] text-white transition-all shadow-md active:scale-95"
            >
              Start a Commute Group
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {groups.map((grp) => {
            const isFull = grp.current_members >= grp.max_members;
            const isJoining = joiningId === grp.id;

            return (
              <DataCard
                key={grp.id}
                className="border border-slate-200 dark:border-white/20 p-5 sm:p-6 shadow-sm hover:shadow-md transition-all"
                header={
                  <>
                    <Badge variant="sky" size="sm" className="font-bold text-xs uppercase tracking-wider">
                      {grp.mode}
                    </Badge>
                    <span className="text-xs sm:text-sm font-mono font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 bg-emerald-100/80 dark:bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-300 dark:border-emerald-600/40">
                      <Clock className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      {grp.departure_time}
                    </span>
                  </>
                }
                title={
                  <span className="font-black text-base sm:text-xl text-slate-950 dark:text-white tracking-tight">
                    {grp.origin_area}
                  </span>
                }
                footer={
                  <>
                    <div className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium">
                      Host: <strong className="text-slate-950 dark:text-white font-bold">{grp.creator_pseudonym}</strong>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-xs sm:text-sm font-bold ${isFull ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {grp.current_members} / {grp.max_members} spots
                      </span>

                      <button
                        onClick={() => handleJoin(grp.id)}
                        disabled={isFull || isJoining}
                        aria-label={isFull ? 'Group is full' : `Join group from ${grp.origin_area}`}
                        className={`touch-target px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                          isFull
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border border-slate-200 dark:border-white/10'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 hover:shadow-md'
                        }`}
                      >
                        {isFull ? (
                          <span>Full</span>
                        ) : (
                          <>
                            <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
                            <span>{isJoining ? 'Joining...' : 'Join Group'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                }
              >
                <MetaList className="space-y-2 pt-1">
                  <MetaRow
                    icon={<MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                    label="Origin Area"
                    labelClassName="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400"
                    valueClassName="text-slate-950 dark:text-white font-bold text-sm sm:text-base"
                  >
                    {grp.origin_area}
                  </MetaRow>
                  <MetaRow
                    icon={<GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                    label="Destination"
                    labelClassName="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400"
                    valueClassName="text-[#800020] dark:text-[#ccff00] font-bold text-sm sm:text-base"
                  >
                    {grp.destination_college}
                  </MetaRow>
                  <MetaRow
                    icon={<ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                    label="Public Meeting Hub"
                    labelClassName="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400"
                    valueClassName="text-slate-800 dark:text-slate-200 font-semibold text-xs sm:text-sm"
                  >
                    {grp.meeting_point || 'Public Station Concourse / Main Gate'}
                  </MetaRow>
                </MetaList>

                {grp.notes && (
                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium bg-slate-50 dark:bg-[#0a0c16]/70 p-3 rounded-xl border border-slate-200/80 dark:border-white/10 mt-3 leading-relaxed">
                    "{grp.notes}"
                  </p>
                )}
              </DataCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
