import React from 'react';

/**
 * Input - Reusable input field component
 * 
 * A flexible input component with consistent styling, validation states,
 * and full accessibility support.
 * 
 * @param {Object} props
 * @param {string} props.label - Input label
 * @param {string} props.id - Input ID (auto-generated if not provided)
 * @param {string} props.type - Input type (text, email, password, number, etc.)
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {boolean} props.required - Mark as required
 * @param {boolean} props.disabled - Disable input
 * @param {string} props.error - Error message
 * @param {string} props.hint - Helper text
 * @param {React.ReactNode} props.icon - Optional icon (left side)
 * @param {string} props.className - Additional CSS classes for input
 * @param {string} props.containerClassName - Additional CSS classes for container
 * @param {Object} props.rest - Other input props
 * 
 * @example
 * <Input 
 *   label="Email"
 *   type="email"
 *   value={email}
 *   onChange={(e) => setEmail(e.target.value)}
 *   required
 *   error={emailError}
 * />
 */
export default function Input({
  label,
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  hint,
  icon,
  className = '',
  containerClassName = '',
  ...rest
}) {
  // Generate unique ID if not provided
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  // Base input styles with 44px touch target
  const baseStyles = 'w-full min-h-[44px] bg-white dark:bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed shadow-sm';
  
  // Border styles based on state
  const borderStyles = error
    ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500'
    : 'border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 focus:border-blue-500 dark:focus:border-blue-400';
  
  // Icon padding
  const iconPadding = icon ? 'pl-10' : '';
  
  // Combine styles
  const inputStyles = `${baseStyles} ${borderStyles} ${iconPadding} ${className}`;
  
  return (
    <div className={`${containerClassName}`}>
      {label && (
        <label 
          htmlFor={inputId} 
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        
        <input
          id={inputId}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={inputStyles}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
      </div>
      
      {error && (
        <p 
          id={`${inputId}-error`} 
          className="mt-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium"
          role="alert"
        >
          {error}
        </p>
      )}
      
      {hint && !error && (
        <p 
          id={`${inputId}-hint`} 
          className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
