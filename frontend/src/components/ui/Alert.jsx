import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

/**
 * Alert - Reusable alert/notification component
 * 
 * Displays contextual feedback messages to users with different severity levels.
 * 
 * @param {Object} props
 * @param {'success' | 'error' | 'warning' | 'info'} props.variant - Alert type
 * @param {string} props.title - Alert title
 * @param {React.ReactNode} props.children - Alert content/message
 * @param {boolean} props.dismissible - Show close button
 * @param {Function} props.onDismiss - Dismiss handler
 * @param {React.ReactNode} props.icon - Custom icon (overrides default)
 * @param {string} props.className - Additional CSS classes
 * 
 * @example
 * <Alert variant="success" title="Success">
 *   Your report was submitted successfully.
 * </Alert>
 * 
 * <Alert variant="error" dismissible onDismiss={handleClose}>
 *   Failed to load data. Please try again.
 * </Alert>
 */
export default function Alert({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  icon: customIcon,
  className = '',
}) {
  // Variant configurations
  const variants = {
    success: {
      container: 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-500/30 dark:text-emerald-200',
      icon: CheckCircle2,
      iconColor: 'text-emerald-700 dark:text-emerald-400',
      title: 'text-emerald-800 dark:text-emerald-300',
    },
    error: {
      container: 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/20 dark:border-rose-500/30 dark:text-rose-200',
      icon: AlertCircle,
      iconColor: 'text-rose-700 dark:text-rose-400',
      title: 'text-rose-800 dark:text-rose-300',
    },
    warning: {
      container: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/20 dark:border-amber-500/30 dark:text-amber-200',
      icon: AlertTriangle,
      iconColor: 'text-amber-800 dark:text-amber-400',
      title: 'text-amber-800 dark:text-amber-300',
    },
    info: {
      container: 'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-950/20 dark:border-sky-500/30 dark:text-sky-200',
      icon: Info,
      iconColor: 'text-sky-700 dark:text-sky-400',
      title: 'text-sky-800 dark:text-sky-300',
    },
  };
  
  const config = variants[variant];
  const Icon = customIcon || config.icon;
  
  return (
    <div 
      className={`flex items-start gap-3 p-4 border rounded-xl ${config.container} ${className}`}
      role="alert"
    >
      {Icon && (
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} aria-hidden="true" />
      )}
      
      <div className="flex-1 min-w-0">
        {title && (
          <div className={`text-sm font-semibold mb-1 ${config.title}`}>
            {title}
          </div>
        )}
        <div className="text-sm">
          {children}
        </div>
      </div>
      
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
