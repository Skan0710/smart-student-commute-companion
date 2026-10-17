import React, { useState } from 'react';
import { LogIn, UserPlus, Mail } from 'lucide-react';
import { Alert, Button, Input, Tabs, TabPanel } from './ui';
import PasswordField from './ui/PasswordField';
import {
  focusFirstInvalid,
  validateEmail,
  validateForm,
  validatePassword,
  validateRequired,
  validateText,
} from '../utils/validation';

// Field → DOM id map so failed submits hand focus to the first invalid field
const AUTH_FIELD_IDS = {
  email: 'account-email',
  password: 'account-password',
  full_name: 'account-full-name',
  college_name: 'account-college',
};

/**
 * Build the client-side rules for the active mode. The rules mirror the
 * backend's `registerSchema` / `loginSchema` (same limits, same messages) so
 * the form rejects exactly what the server would reject — never more.
 *
 * @param {boolean} isRegisterMode - Register rules vs sign-in rules
 * @returns {Object} validateForm() schema
 */
function buildAuthSchema(isRegisterMode) {
  const schema = {
    email: [
      (value) => validateRequired(value, 'Email address'),
      (value) => (value && value.length > 255 ? 'Email cannot exceed 255 characters' : null),
      (value) => validateEmail(value),
    ],
    password: [
      (value) => validateRequired(value, 'Password'),
      (value) => validatePassword(value, { registration: isRegisterMode }),
    ],
  };

  if (isRegisterMode) {
    schema.full_name = [
      (value) => validateRequired(value, 'Full name'),
      (value) => validateText(value, { minLength: 2, maxLength: 100, label: 'Full name' }),
    ];
    schema.college_name = [
      (value) => validateRequired(value, 'College name'),
      (value) => validateText(value, { minLength: 2, maxLength: 150, label: 'College name' }),
    ];
  }

  return schema;
}

/**
 * AuthForm - Sign-in / create-account form for the Student Account screen
 *
 * Owns everything about the credential form: the Sign in ↔ Create account
 * mode switch, the in-progress field drafts, and the password reveal (via
 * `ui/PasswordField`). Submission reuses the real backend auth contract and
 * arrives through props — this component never fabricates a response.
 *
 * The surrounding screen (session states, profile card) lives in
 * `pages/AccountPage.jsx`; validation rules and submit guards are layered on
 * in the interaction pass.
 *
 * @param {Object} props
 * @param {Function} props.onSubmitSignIn - ({ email, password }) => Promise|void
 * @param {Function} props.onSubmitRegister - ({ email, password, full_name, college_name }) => Promise|void
 * @param {boolean} [props.isSubmitting] - A request is in flight (disables the form)
 * @param {string|null} [props.submitError] - Server-side error for the current attempt
 * @param {Function} [props.onDismissSubmitError] - Clear the visible submit error
 */
function GoogleIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.94 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export default function AuthForm({
  onSubmitSignIn,
  onSubmitRegister,
  isSubmitting = false,
  submitError = null,
  onDismissSubmitError,
}) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  // A field validates on blur once the student has engaged with it, or after
  // the first submit attempt — tabbing past an untouched empty field never
  // shouts "required" at them.
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [googleNotice, setGoogleNotice] = useState(null);

  const isRegisterMode = mode === 'register';

  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setGoogleNotice(
        'Google Sign-In requires VITE_GOOGLE_CLIENT_ID in .env. Configure this client credential to enable Google OAuth authentication.'
      );
      return;
    }
    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=email%20profile`;
    window.location.href = authUrl;
  };

  const currentValues = () =>
    isRegisterMode
      ? { email, password, full_name: fullName, college_name: collegeName }
      : { email, password };

  const validateSingle = (name, value) => {
    const schema = buildAuthSchema(isRegisterMode);
    if (!schema[name]) return null;
    const { errors } = validateForm({ [name]: value }, { [name]: schema[name] });
    return errors[name] || null;
  };

  const clearFieldError = (name) => {
    setFieldErrors((current) =>
      current[name] ? { ...current, [name]: undefined } : current
    );
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    // Errors belong to the mode that produced them (sign-in rules differ from
    // registration rules) — drop both field errors and the server message.
    setFieldErrors({});
    setTouched({});
    setSubmitAttempted(false);
    onDismissSubmitError?.();
  };

  const handleBlur = (name, value) => {
    setTouched((current) => ({ ...current, [name]: true }));
    const shouldValidate = submitAttempted || touched[name] ||
      (typeof value === 'string' && value.trim().length > 0);
    if (!shouldValidate) return;
    const error = validateSingle(name, value);
    setFieldErrors((current) => ({ ...current, [name]: error || undefined }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting) return; // ignore Enter/double-click while a request runs

    const values = currentValues();
    const { isValid, errors } = validateForm(values, buildAuthSchema(isRegisterMode));
    setSubmitAttempted(true);

    if (!isValid) {
      setFieldErrors(errors);
      focusFirstInvalid(errors, AUTH_FIELD_IDS);
      return;
    }

    setFieldErrors({});
    if (isRegisterMode) {
      onSubmitRegister?.(values);
    } else {
      onSubmitSignIn?.(values);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 id="account-auth-heading" className="text-base font-bold text-slate-900 dark:text-slate-100">
          {isRegisterMode ? 'Create your student account' : 'Sign in to your account'}
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Your session stays on this device. No account is needed for route planning,
          live alerts, or transit search.
        </p>
      </div>

      {/* Google Sign-In conforming to branding guidelines */}
      <div className="space-y-3 pt-1">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750 font-medium text-sm shadow-sm hover:shadow transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          aria-label={isRegisterMode ? 'Sign up with Google' : 'Continue with Google'}
        >
          <GoogleIcon className="w-5 h-5 shrink-0" />
          <span>{isRegisterMode ? 'Sign up with Google' : 'Continue with Google'}</span>
        </button>

        {googleNotice && (
          <Alert
            variant="info"
            title="Google Sign-In Notice"
            dismissible
            onDismiss={() => setGoogleNotice(null)}
          >
            {googleNotice}
          </Alert>
        )}

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-slate-900 px-3 text-slate-500 dark:text-slate-400 font-medium tracking-wider">
              Or continue with email
            </span>
          </div>
        </div>
      </div>

      <Tabs
        idPrefix="account-auth"
        ariaLabel="Account access mode"
        tabs={[
          { id: 'signin', label: 'Sign in', icon: LogIn },
          { id: 'register', label: 'Create account', icon: UserPlus },
        ]}
        activeTab={mode}
        onChange={handleModeChange}
      />

      <TabPanel idPrefix="account-auth" tabId={mode}>
        {submitError && (
          <div className="mb-4">
            <Alert
              variant="error"
              title={isRegisterMode ? 'Could not create the account' : 'Could not sign in'}
              dismissible
              onDismiss={onDismissSubmitError}
            >
              {submitError}
            </Alert>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
          className="space-y-4"
        >
          <Input
            id="account-email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@college.edu"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError('email');
            }}
            onBlur={(event) => handleBlur('email', event.target.value)}
            error={fieldErrors.email}
            icon={<Mail className="w-4 h-4" aria-hidden="true" />}
            required
            disabled={isSubmitting}
          />

          <PasswordField
            id="account-password"
            label="Password"
            autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
            placeholder={isRegisterMode ? 'Choose a password' : 'Your password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError('password');
            }}
            onBlur={(event) => handleBlur('password', event.target.value)}
            error={fieldErrors.password}
            required
            disabled={isSubmitting}
          />

          {isRegisterMode && (
            <>
              <Input
                id="account-full-name"
                label="Full name"
                type="text"
                autoComplete="name"
                placeholder="Your full name"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  clearFieldError('full_name');
                }}
                onBlur={(event) => handleBlur('full_name', event.target.value)}
                error={fieldErrors.full_name}
                required
                disabled={isSubmitting}
              />
              <Input
                id="account-college"
                label="College name"
                type="text"
                autoComplete="organization"
                placeholder="Your college"
                value={collegeName}
                onChange={(event) => {
                  setCollegeName(event.target.value);
                  clearFieldError('college_name');
                }}
                onBlur={(event) => handleBlur('college_name', event.target.value)}
                error={fieldErrors.college_name}
                hint="At least 2 characters — shown on your student profile."
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Password must be at least 8 characters and include an uppercase letter,
                a lowercase letter, and a number.
              </p>
            </>
          )}

          {/* The action appears once the App layer wires the real service
              handlers — this form never submits to a fake backend. */}
          {(isRegisterMode ? onSubmitRegister : onSubmitSignIn) && (
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              icon={
                isRegisterMode ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )
              }
            >
              {isRegisterMode
                ? isSubmitting
                  ? 'Creating account…'
                  : 'Create account'
                : isSubmitting
                  ? 'Signing in…'
                  : 'Sign in'}
            </Button>
          )}
        </form>
      </TabPanel>
    </div>
  );
}
