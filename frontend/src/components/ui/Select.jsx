import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Select - Reusable select dropdown component
 * 
 * A styled select component with consistent design and accessibility.
 * 
 * @param {Object} props
 * @param {string} props.label - Select label
 * @param {string} props.id - Select ID (auto-generated if not provided)
 * @param {Array} props.options - Array of options [{value, label}]
 * @param {string} props.value - Selected value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text (first option)
 * @param {boolean} props.required - Mark as required
 * @param {boolean} props.disabled - Disable select
 * @param {string} props.error - Error message
 * @param {string} props.hint - Helper text
 * @param {string} props.className - Additional CSS classes for select
 * @param {string} props.containerClassName - Additional CSS classes for container
 * @param {Object} props.rest - Other select props
 * 
 * @example
 * <Select 
 *   label="Mode of Transport"
 *   options={[
 *     { value: 'train', label: 'Train' },
 *     { value: 'bus', label: 'Bus' }
 *   ]}
 *   value={mode}
 *   onChange={(e) => setMode(e.target.value)}
 * />
 */
export default function Select({
  label,
  id,
  options = [],
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  error,
  hint,
  className = '',
  containerClassName = '',
  ...rest
}) {
  // Stable unique ID when none is provided (useId is stable across renders)
  const autoId = useId();
  const selectId = id || autoId;
  
  // Base select styles with 44px touch target
  const baseStyles = 'w-full min-h-[44px] bg-white dark:bg-slate-950 border rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-900 dark:text-white transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none shadow-sm';
  
  // Border styles based on state
  const borderStyles = error
    ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500'
    : 'border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 focus:border-blue-500 dark:focus:border-blue-400';
  
  // Combine styles
  const selectStyles = `${baseStyles} ${borderStyles} ${className}`;
  
  return (
    <div className={`${containerClassName}`}>
      {label && (
        <label 
          htmlFor={selectId} 
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={selectStyles}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        
        <ChevronDown 
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" 
          aria-hidden="true"
        />
      </div>
      
      {error && (
        <p 
          id={`${selectId}-error`} 
          className="mt-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium"
          role="alert"
        >
          {error}
        </p>
      )}
      
      {hint && !error && (
        <p 
          id={`${selectId}-hint`} 
          className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
