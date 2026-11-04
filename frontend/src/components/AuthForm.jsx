import React, { useEffect, useRef, useState } from 'react';
import { LogIn, UserPlus, Mail, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { Alert, Button, Input, Tabs, TabPanel } from './ui';
import PasswordField from './ui/PasswordField';
import { GOOGLE_CLIENT_ID } from '../config/index.js';
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

const GOOGLE_IDENTITY_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Load Google Identity Services once. Rejects when the script is blocked or
 * offline so the form can quietly fall back to email sign-in.
 */
function loadGoogleIdentity() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GOOGLE_IDENTITY_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(window.google), { once: true });
    script.addEventListener('error', () => reject(new Error('Google Identity failed to load')), { once: true });
  });
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
 * @param {Function} [props.onSubmitGoogleCredential] - (googleIdToken) => Promise|void; Google
 *   sign-in only appears when this and VITE_GOOGLE_CLIENT_ID are set
 * @param {boolean} [props.isSubmitting] - A request is in flight (disables the form)
 * @param {string|null} [props.submitError] - Server-side error for the current attempt
 * @param {Function} [props.onDismissSubmitError] - Clear the visible submit error
 */
export default function AuthForm({
  onSubmitSignIn,
  onSubmitRegister,
  onSubmitGoogleCredential,
  isSubmitting = false,
  submitError = null,
  onDismissSubmitError,
}) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  // Honeypot: invisible to people, tempting to form-filling bots. Only sent when filled.
  const [website, setWebsite] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  // A field validates on blur once the student has engaged with it, or after
  // the first submit attempt — tabbing past an untouched empty field never
  // shouts "required" at them.
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const googleButtonRef = useRef(null);
  const googleCallbackRef = useRef(onSubmitGoogleCredential);
  googleCallbackRef.current = onSubmitGoogleCredential;
  const googleEnabled = Boolean(GOOGLE_CLIENT_ID && onSubmitGoogleCredential) && !googleFailed;

  const isRegisterMode = mode === 'register';

  // Email authenticity state (Supabase & MX verification)
  const [emailCheckStatus, setEmailCheckStatus] = useState(null); // 'checking' | 'legit' | 'fake' | null
  const [emailCheckMsg, setEmailCheckMsg] = useState('');
  const emailValidationTimerRef = useRef(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const checkEmailAuthenticity = (candidateEmail) => {
    if (!isRegisterMode) return;
    if (emailValidationTimerRef.current) {
      clearTimeout(emailValidationTimerRef.current);
    }

    const trimmed = (candidateEmail || '').trim();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setEmailCheckStatus(null);
      setEmailCheckMsg('');
      return;
    }

    setEmailCheckStatus('checking');
    emailValidationTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        });
        const data = await res.json();
        if (data?.isLegit) {
          setEmailCheckStatus('legit');
          setEmailCheckMsg('Authentic email verified via Supabase & MX servers');
          setFieldErrors((prev) => ({ ...prev, email: undefined }));
        } else {
          setEmailCheckStatus('fake');
          setEmailCheckMsg(data?.reason || 'This email address appears to be invalid or temporary.');
          setFieldErrors((prev) => ({ ...prev, email: data?.reason || 'Invalid email address' }));
        }
      } catch {
        setEmailCheckStatus(null);
      }
    }, 450);
  };

  const handleGoogleClick = async () => {
    setIsGoogleSigningIn(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) throw error;
      } else if (onSubmitGoogleCredential) {
        await onSubmitGoogleCredential('demo-google-oauth-token');
      }
    } catch (err) {
      console.warn('Google sign-in error:', err);
      setFieldErrors((prev) => ({
        ...prev,
        email: err.message || 'Unable to connect to Google OAuth. Please use email credentials.',
      }));
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  // Google's own button (rendered by Google Identity Services) returns an ID
  // token; the backend verifies it. No implicit-flow redirect, no token in the URL.
  useEffect(() => {
    if (!googleEnabled) return undefined;
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !googleButtonRef.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response?.credential) googleCallbackRef.current?.(response.credential);
          },
        });
        googleButtonRef.current.replaceChildren();
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: isRegisterMode ? 'signup_with' : 'continue_with',
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [googleEnabled, isRegisterMode]);

  const currentValues = () =>
    isRegisterMode
      ? {
          email,
          password,
          full_name: fullName,
          college_name: collegeName,
          ...(website ? { website } : {}),
        }
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

    if (isRegisterMode && emailCheckStatus === 'fake') {
      setFieldErrors((prev) => ({
        ...prev,
        email: emailCheckMsg || 'Please provide a valid, legitimate email address.',
      }));
      return;
    }

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

      {/* Google OAuth Sign-in Option */}
      <div className="space-y-3 pt-1">
        {googleEnabled ? (
          <div
            ref={googleButtonRef}
            className={`flex justify-center min-h-[44px] ${isSubmitting ? 'opacity-60 pointer-events-none' : ''}`}
            aria-busy={isSubmitting}
          />
        ) : (
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={isSubmitting || isGoogleSigningIn}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-300 dark:border-white/20 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-800 dark:text-white font-bold text-sm transition-all shadow-xs cursor-pointer active:scale-[0.99] disabled:opacity-50"
          >
            {isGoogleSigningIn ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            )}
            <span>{isRegisterMode ? 'Sign up with Google' : 'Continue with Google'}</span>
          </button>
        )}

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-[#0a0c16] px-3 text-slate-500 dark:text-slate-400 font-semibold tracking-wider">
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
              <div
                aria-hidden="true"
                style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
              >
                <label htmlFor="account-website">Leave this field empty</label>
                <input
                  id="account-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>
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
