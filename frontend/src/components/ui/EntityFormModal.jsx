import React, { useEffect, useId, useState } from 'react';
import Modal from './Modal';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';
import Alert from './Alert';

/**
 * EntityFormModal - config-driven "create a thing" dialog
 *
 * One accessible form shell shared by every add/create flow (courses,
 * assignments, goals, journeys…). Fields are declared as data; the dialog owns
 * values, per-field validation, the submit lifecycle and the error banner.
 *
 * - Required + custom validation runs before submit; the first invalid field
 *   receives focus and every error is announced via the shared inputs.
 * - `onSubmit(values)` may be async. Resolving closes the dialog; rejecting
 *   keeps it open and shows the error message in an alert so nothing is lost.
 * - Double submits are ignored while a request is in flight.
 * - Values reset every time the dialog opens.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {string} props.title
 * @param {React.ReactNode} [props.icon]
 * @param {React.ReactNode} [props.description] - Short helper text above the fields
 * @param {Array<Object>} props.fields - { name, label, type, required, options, placeholder, hint,
 *   min, max, step, rows, maxLength, half, validate(value, values) → string|null }
 * @param {Object} [props.initialValues]
 * @param {Function} props.onSubmit - (values) => Promise|void
 * @param {string} [props.submitLabel='Save']
 * @param {React.ReactNode} [props.children] - Extra content rendered under the fields
 */
export default function EntityFormModal({
  isOpen,
  onClose,
  title,
  icon,
  description,
  fields,
  initialValues = {},
  onSubmit,
  submitLabel = 'Save',
  children,
}) {
  const formId = useId();
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fresh form each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    const next = {};
    fields.forEach((field) => {
      next[field.name] = initialValues[field.name] ?? (field.type === 'select' ? field.options?.[0]?.value ?? '' : '');
    });
    setValues(next);
    setErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fieldId = (name) => `${formId}-${name}`;

  const validate = () => {
    const found = {};
    fields.forEach((field) => {
      const raw = values[field.name];
      const text = typeof raw === 'string' ? raw.trim() : raw;
      if (field.required && (text === '' || text === undefined || text === null)) {
        found[field.name] = `${field.label} is required.`;
        return;
      }
      if (field.type === 'number' && text !== '' && text !== undefined) {
        const number = Number(text);
        if (!Number.isFinite(number)) found[field.name] = `${field.label} must be a number.`;
        else if (field.min !== undefined && number < field.min) found[field.name] = `${field.label} must be at least ${field.min}.`;
        else if (field.max !== undefined && number > field.max) found[field.name] = `${field.label} must be at most ${field.max}.`;
      }
      if (!found[field.name] && field.validate) {
        const message = field.validate(raw, values);
        if (message) found[field.name] = message;
      }
    });
    return found;
  };

  const handleChange = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const firstInvalid = fields.find((field) => found[field.name]);
      if (firstInvalid) document.getElementById(fieldId(firstInvalid.name))?.focus();
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field) => {
    const common = {
      id: fieldId(field.name),
      label: field.label,
      required: field.required,
      hint: field.hint,
      error: errors[field.name] || undefined,
      value: values[field.name] ?? '',
      disabled: isSubmitting,
    };

    if (field.type === 'select') {
      return (
        <Select
          {...common}
          options={field.options || []}
          onChange={(event) => handleChange(field.name, event.target.value)}
        />
      );
    }
    if (field.type === 'textarea') {
      return (
        <Textarea
          {...common}
          rows={field.rows || 3}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => handleChange(field.name, event.target.value)}
        />
      );
    }
    return (
      <Input
        {...common}
        type={field.type || 'text'}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        step={field.step}
        maxLength={field.maxLength}
        onChange={(event) => handleChange(field.name, event.target.value)}
      />
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={icon} size="md">
      <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
        {description && <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((field) => (
            <div key={field.name} className={field.half ? '' : 'sm:col-span-2'}>
              {renderField(field)}
            </div>
          ))}
        </div>

        {children}

        {submitError && (
          <Alert variant="error" title="Could not save" dismissible onDismiss={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
