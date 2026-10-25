import React from 'react';

/**
 * LinkButton - an <a> that looks like the design system's Button.
 *
 * Navigation is a link (crawlable, middle-clickable, works without JS), not a
 * button with a click handler. Visual language matches ui/Button.
 *
 * @param {Object} props
 * @param {string} props.href
 * @param {'primary'|'secondary'} [props.variant='primary']
 * @param {'md'|'lg'} [props.size='lg']
 * @param {boolean} [props.fullWidth=false]
 * @param {React.ReactNode} [props.icon]
 */
export default function LinkButton({
  href,
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  icon = null,
  className = '',
  children,
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950';
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 shadow-sm',
    secondary:
      'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700',
  };
  const sizes = {
    md: 'min-h-[44px] px-4 py-2.5 text-sm rounded-xl',
    lg: 'min-h-[48px] px-6 py-3 text-base rounded-xl',
  };

  if (variant === 'primary') {
    return (
      <a
        href={href}
        className={`group inline-flex items-center justify-center gap-2 font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-md shadow-blue-500/20 rounded-xl relative overflow-hidden transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...rest}
      >
        {/* Subtle shine sweep overlay */}
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-white/20 to-transparent"
          aria-hidden="true"
        />
        {icon}
        <span className="relative z-10">{children}</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </a>
  );
}
