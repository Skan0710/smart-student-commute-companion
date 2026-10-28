import React from 'react';
import { Bell } from 'lucide-react';
import { Badge } from './ui';
import { formatAge } from '../utils/formatters';

export default function NotificationItem({ report, isRead = false, onToggleRead }) {
  return (
    <article className={`flex min-w-0 gap-3 p-3 sm:p-4 ${isRead ? 'opacity-70' : 'bg-blue-500/[0.05]'}`}>
      <span className="mt-0.5 self-start shrink-0 rounded-full bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300" aria-hidden="true">
        <Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{report.area || 'Commute update'}</h2>
          <time dateTime={report.created_at || undefined} className="text-xs text-slate-500 dark:text-slate-400">{formatAge(report?.ageMinutes)}</time>
        </div>
        <p className="mt-1 break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{report.message}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {!isRead && <Badge variant="emerald" size="xs">Unread</Badge>}
          {report.mode && <p className="text-xs font-medium text-blue-700 dark:text-blue-300 capitalize">{report.mode}</p>}
          {onToggleRead && (
            <button
              type="button"
              onClick={() => onToggleRead(report.id)}
              aria-pressed={isRead}
              className="min-h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              {isRead ? 'Mark unread' : 'Mark read'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}