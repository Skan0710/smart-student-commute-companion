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
    <div className="bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              TRAVEL TOGETHER (COMMUTE GROUPS)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Safe student grouping for auto-pooling and local train buddies
            </p>
          </div>
        </div>

        <button
          onClick={onOpenCreateGroup}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>New Group</span>
        </button>
      </div>

      <div className="bg-emerald-50/70 dark:bg-slate-950/70 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            Privacy-Preserving &amp; Consent-Grounded
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Only general station areas, public meeting hubs, and departure time windows are shared. Home addresses are never requested or stored. You can withdraw your participation consent anytime.
          </p>
        </div>
      </div>

      {/* Suggested Public Meeting Points Pill Banner */}
      <div className="bg-slate-50 dark:bg-[#0a0c16]/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Transit Meeting Points
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Public hubs only</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Vile Parle Station East Gate', 'Andheri Metro Concourse', 'D.J. Sanghvi Main Entry', 'Dadar Central FOB', 'Bandra Skywalk Deck'].map((pt) => (
            <span
              key={pt}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            >
              <Check className="w-2.5 h-2.5 text-emerald-700 dark:text-emerald-400" />
              {pt}
            </span>
          ))}
        </div>
      </div>

      {/* Groups List */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6 text-indigo-700 dark:text-indigo-400" aria-hidden="true" />}
          title="No commute groups currently active"
          description="Be the first to create a safe student auto-pool or transit travel buddy group for your college route!"
          action={
            <button
              onClick={onOpenCreateGroup}
              className="touch-target px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Start a Commute Group
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {groups.map((grp) => {
            const isFull = grp.current_members >= grp.max_members;
            const isJoining = joiningId === grp.id;

            return (
              <DataCard
                key={grp.id}
                header={
                  <>
                    <Badge variant="indigo" size="xs">
                      {grp.mode}
                    </Badge>
                    <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/20">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {grp.departure_time}
                    </span>
                  </>
                }
                title={
                  <span className="font-semibold text-slate-900 dark:text-white">{grp.origin_area}</span>
                }
                footer={
                  <>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Host: <strong className="text-slate-800 dark:text-slate-200">{grp.creator_pseudonym}</strong>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold ${isFull ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {grp.current_members} / {grp.max_members} joined
                      </span>

                      <button
                        onClick={() => handleJoin(grp.id)}
                        disabled={isFull || isJoining}
                        aria-label={isFull ? 'Group is full' : `Join group from ${grp.origin_area}`}
                        className={`touch-target px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isFull
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-sm'
                        }`}
                      >
                        {isFull ? (
                          <span>Full</span>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />
                            <span>{isJoining ? 'Joining...' : 'Join Group'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                }
              >
                <MetaList>
                  <MetaRow
                    icon={<MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />}
                    label="Origin"
                    valueClassName="text-slate-900 dark:text-white font-semibold"
                  >
                    {grp.origin_area}
                  </MetaRow>
                  <MetaRow
                    icon={<GraduationCap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    label="Destination"
                    valueClassName="text-indigo-700 dark:text-indigo-300 font-semibold"
                  >
                    {grp.destination_college}
                  </MetaRow>
                  <MetaRow
                    icon={<ShieldCheck className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />}
                    label="Meeting Hub"
                    valueClassName="text-slate-700 dark:text-slate-300 font-medium text-xs"
                  >
                    {grp.meeting_point || 'Public Station Concourse / Main Gate'}
                  </MetaRow>
                </MetaList>

                {grp.notes && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 italic bg-slate-50 dark:bg-[#0a0c16]/50 p-2 rounded-lg border border-slate-200/80 dark:border-slate-850 mt-2.5">
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
