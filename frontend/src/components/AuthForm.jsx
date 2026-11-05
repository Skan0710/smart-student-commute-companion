import React, { useEffect, useRef, useState } from 'react';
import {
  LogIn,
  UserPlus,
  User,
  Lock,
  Eye,
  EyeOff,
  Mail,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { GOOGLE_CLIENT_ID } from '../config/index.js';
import { Tabs } from './ui';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { Checkbox } from './ui/checkbox';
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
 * Client-side validation schema matching server limits.
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
 * AuthForm - Full-width theme-aware authentication component
 * Features:
 *  - Matches the light/dark theme seamlessly (no black patch in light mode)
 *  - Expands to the length of the container (w-full)
 *  - InputOTP component from shadcn for 6-digit OTP verification
 *  - Checkbox component from shadcn for Remember Me
 *  - Google OAuth sign-in
 *  - Real-time DNS MX & Supabase email authenticity validation
 */
export default function AuthForm({
  onSubmitSignIn,
  onSubmitRegister,
  onSubmitGoogleCredential,
  isSubmitting = false,
  submitError = null,
  onDismissSubmitError,
}) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [website, setWebsite] = useState(''); // Accessible honeypot
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // OTP State (Supabase Free Email OTP using InputOTP)
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Forgot Password State
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Email verification status
  const [emailCheckStatus, setEmailCheckStatus] = useState(null); // 'checking' | 'legit' | 'fake' | null
  const [emailCheckMsg, setEmailCheckMsg] = useState('');
  const emailValidationTimerRef = useRef(null);

  // Google OAuth
  const [googleFailed, setGoogleFailed] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const googleButtonRef = useRef(null);
  const googleCallbackRef = useRef(onSubmitGoogleCredential);
  googleCallbackRef.current = onSubmitGoogleCredential;
  const googleEnabled = Boolean(GOOGLE_CLIENT_ID && onSubmitGoogleCredential) && !googleFailed;

  const isRegisterMode = mode === 'register';

  // OTP countdown timer
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  // Real-time DNS MX & format validation
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

  // Google Sign-in Handler
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

  // Supabase Email OTP: Send 6-digit code
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    const trimmedEmail = email.trim();
    const emailFormatError = validateEmail(trimmedEmail);
    if (!trimmedEmail || emailFormatError) {
      setFieldErrors((prev) => ({ ...prev, email: emailFormatError || 'Please enter a valid email address first.' }));
      return;
    }

    if (isRegisterMode && emailCheckStatus === 'fake') {
      setFieldErrors((prev) => ({ ...prev, email: emailCheckMsg || 'Invalid email address.' }));
      return;
    }

    setIsSendingOtp(true);
    onDismissSubmitError?.();
    setOtpMessage('');

    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: true,
            data: {
              full_name: fullName || trimmedEmail.split('@')[0],
              college_name: collegeName || 'Dwarkadas J. Sanghvi College of Engineering',
            },
          },
        });
        if (error) throw error;

        setOtpSent(true);
        setOtpCountdown(60);
        setOtpMessage(`A 6-digit OTP confirmation code was sent to ${trimmedEmail}.`);
      } else {
        setOtpSent(true);
        setOtpCountdown(60);
        setOtpMessage(`Confirmation code sent to ${trimmedEmail} (Demo mode: use code 123456).`);
      }
    } catch (err) {
      console.warn('Supabase OTP error:', err);
      setFieldErrors((prev) => ({
        ...prev,
        email: err.message || 'Failed to send OTP code. Please try again.',
      }));
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Supabase Email OTP: Verify 6-digit code
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedCode = otpCode.trim();

    if (!trimmedCode || trimmedCode.length < 6) {
      setFieldErrors((prev) => ({ ...prev, otp: 'Please enter the complete 6-digit verification code.' }));
      return;
    }

    setIsVerifyingOtp(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.verifyOtp({
          email: trimmedEmail,
          token: trimmedCode,
          type: 'email',
        });
        if (error) throw error;
      } else if (trimmedCode === '123456') {
        onSubmitSignIn?.({ email: trimmedEmail, password: 'demo-otp-login' });
      } else {
        throw new Error('Invalid verification code. Please check your email.');
      }
    } catch (err) {
      console.warn('OTP verify error:', err);
      setFieldErrors((prev) => ({
        ...prev,
        otp: err.message || 'Invalid or expired OTP code. Please request a new one.',
      }));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Forgot Password Handler
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const emailFormatError = validateEmail(trimmedEmail);
    if (!trimmedEmail || emailFormatError) {
      setFieldErrors((prev) => ({ ...prev, email: emailFormatError || 'Enter your email to receive a password reset link.' }));
      return;
    }
    setIsResettingPassword(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
      }
      setResetEmailSent(true);
    } catch (err) {
      setFieldErrors((prev) => ({ ...prev, email: err.message || 'Failed to send password reset.' }));
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Load Google Identity Services if client ID exists
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
        const containerWidth = googleButtonRef.current?.offsetWidth || 380;
        const targetWidth = Math.min(Math.max(containerWidth, 240), 400);
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: isRegisterMode ? 'signup_with' : 'continue_with',
          width: targetWidth,
          logo_alignment: 'left',
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
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setFieldErrors({});
    setTouched({});
    setSubmitAttempted(false);
    setOtpSent(false);
    setOtpCode('');
    setOtpMessage('');
    setAuthMethod('password');
    setForgotPasswordOpen(false);
    setResetEmailSent(false);
    onDismissSubmitError?.();
  };

  const handleBlur = (name, value) => {
    setTouched((current) => ({ ...current, [name]: true }));
    const shouldValidate =
      submitAttempted || touched[name] || (typeof value === 'string' && value.trim().length > 0);
    if (!shouldValidate) return;
    const error = validateSingle(name, value);
    setFieldErrors((current) => ({ ...current, [name]: error || undefined }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting) return;

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
    <div className="w-full bg-white dark:bg-[#0a0c16] text-slate-800 dark:text-slate-100 rounded-2xl sm:rounded-3xl border border-[#d8d3c5] dark:border-[#1e2440] shadow-sm overflow-hidden transition-colors">
      {/* Top Segmented Mode Switch */}
      <div className="pt-6 px-6 sm:px-8">
        <Tabs
          idPrefix="account-auth"
          ariaLabel="Account access mode"
          tabs={[
            { id: 'signin', label: 'Log In', icon: LogIn },
            { id: 'register', label: 'Sign Up', icon: UserPlus },
          ]}
          activeTab={mode}
          onChange={handleModeChange}
        />
      </div>

      {/* Main Form Body */}
      <div className="p-6 sm:p-8 pt-4 space-y-4">
        {/* Error Notification */}
        {submitError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{isRegisterMode ? 'Sign up error' : 'Sign in error'}</p>
              <p className="mt-0.5 opacity-90">{submitError}</p>
            </div>
            {onDismissSubmitError && (
              <button
                type="button"
                onClick={onDismissSubmitError}
                className="text-rose-600 dark:text-rose-400 hover:opacity-75 text-xs font-bold px-1"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Supabase Free Email OTP Mode Screen using shadcn InputOTP */}
        {authMethod === 'otp' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('password');
                  setOtpSent(false);
                }}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors p-1 -ml-1 rounded-lg"
                aria-label="Back to password login"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              </button>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {otpSent ? 'Confirm 6-Digit OTP' : 'Sign in with Email OTP'}
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supabase Email Authentication delivers a secure 6-digit verification code directly to your email.
            </p>

            {otpMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span>{otpMessage}</span>
              </div>
            )}

            {!otpSent ? (
              <form onSubmit={handleSendOtp} aria-busy={isSendingOtp} className="space-y-4">
                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <User className="absolute left-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <input
                      id="account-email"
                      type="email"
                      required
                      placeholder="Username, Phone, or Email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium border border-slate-300 dark:border-slate-700/80 focus:border-[#800020] dark:focus:border-[#0047ff] focus:outline-none transition-colors"
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 pl-1 pt-1">{fieldErrors.email}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSendingOtp}
                  className="w-full h-12 bg-[#800020] hover:bg-[#6b001a] active:bg-[#570015] dark:bg-[#0047ff] dark:hover:bg-[#003be0] dark:active:bg-[#0030c0] text-white text-sm sm:text-base font-bold rounded-xl shadow-md shadow-[#800020]/20 dark:shadow-[#0047ff]/25 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSendingOtp ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                      <span>Sending OTP…</span>
                    </>
                  ) : (
                    <span>Send 6-Digit OTP Code</span>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} aria-busy={isVerifyingOtp} className="space-y-5">
                <div className="space-y-2 text-center">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Enter the 6 digits sent to <span className="font-bold text-slate-900 dark:text-white">{email}</span>
                  </p>
                  <div className="flex justify-center pt-2">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={(val) => {
                        setOtpCode(val);
                        clearFieldError('otp');
                      }}
                    >
                      <InputOTPGroup className="gap-2 sm:gap-3">
                        <InputOTPSlot index={0} className="w-10 sm:w-12 h-12 text-lg font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" />
                        <InputOTPSlot index={1} className="w-10 sm:w-12 h-12 text-lg font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" />
                        <InputOTPSlot index={2} className="w-10 sm:w-12 h-12 text-lg font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" />
                        <InputOTPSlot index={3} className="w-10 sm:w-12 h-12 text-lg font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" />
                        <InputOTPSlot index={4} className="w-10 sm:w-12 h-12 text-lg font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" />
                        <InputOTPSlot index={5} className="w-10 sm:w-12 h-12 text-lg font-black rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {fieldErrors.otp && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 pt-1">{fieldErrors.otp}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingOtp}
                  className="w-full h-12 bg-[#800020] hover:bg-[#6b001a] active:bg-[#570015] dark:bg-[#0047ff] dark:hover:bg-[#003be0] dark:active:bg-[#0030c0] text-white text-sm sm:text-base font-bold rounded-xl shadow-md shadow-[#800020]/20 dark:shadow-[#0047ff]/25 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isVerifyingOtp ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                      <span>Verifying…</span>
                    </>
                  ) : (
                    <span>Confirm &amp; Log In</span>
                  )}
                </button>

                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <button
                    type="button"
                    disabled={otpCountdown > 0 || isSendingOtp}
                    onClick={handleSendOtp}
                    className="hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-40"
                  >
                    {otpCountdown > 0 ? `Resend code in ${otpCountdown}s` : 'Resend OTP Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="hover:text-slate-800 dark:hover:text-white transition-colors"
                  >
                    Change Email
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Email & Password Credential Layout */
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-busy={isSubmitting}
            className="space-y-3.5"
          >
            {/* Email input field */}
            <div className="space-y-1">
              <div className="relative flex items-center">
                <User className="absolute left-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Username, Phone, or Email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                    checkEmailAuthenticity(e.target.value);
                  }}
                  onBlur={(e) => handleBlur('email', e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium border border-slate-300 dark:border-slate-700/80 focus:border-[#800020] dark:focus:border-[#0047ff] focus:outline-none transition-colors"
                />
              </div>

              {/* Real-time Email Legitimacy Badge */}
              {isRegisterMode && emailCheckStatus === 'checking' && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pl-1 pt-0.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" aria-hidden="true" />
                  <span>Checking email legitimacy via Supabase &amp; MX servers…</span>
                </div>
              )}
              {isRegisterMode && emailCheckStatus === 'legit' && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 pl-1 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>{emailCheckMsg}</span>
                </div>
              )}
              {fieldErrors.email && (
                <p className="text-xs text-rose-600 dark:text-rose-400 pl-1 pt-0.5">{fieldErrors.email}</p>
              )}
            </div>

            {/* Extra registration fields (Full name & College) */}
            {isRegisterMode && (
              <>
                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <User className="absolute left-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <input
                      id="account-full-name"
                      type="text"
                      autoComplete="name"
                      required
                      placeholder="Full Name"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        clearFieldError('full_name');
                      }}
                      onBlur={(e) => handleBlur('full_name', e.target.value)}
                      className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium border border-slate-300 dark:border-slate-700/80 focus:border-[#800020] dark:focus:border-[#0047ff] focus:outline-none transition-colors"
                    />
                  </div>
                  {fieldErrors.full_name && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 pl-1 pt-0.5">{fieldErrors.full_name}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <GraduationCap className="absolute left-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <input
                      id="account-college"
                      type="text"
                      autoComplete="organization"
                      required
                      placeholder="College Name (e.g. DJSCE)"
                      value={collegeName}
                      onChange={(e) => {
                        setCollegeName(e.target.value);
                        clearFieldError('college_name');
                      }}
                      onBlur={(e) => handleBlur('college_name', e.target.value)}
                      className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium border border-slate-300 dark:border-slate-700/80 focus:border-[#800020] dark:focus:border-[#0047ff] focus:outline-none transition-colors"
                    />
                  </div>
                  {fieldErrors.college_name && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 pl-1 pt-0.5">{fieldErrors.college_name}</p>
                  )}
                </div>

                {/* Honeypot field for bot protection */}
                <div
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
                >
                  <label htmlFor="account-website">Leave empty</label>
                  <input
                    id="account-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Password input field with Eye reveal toggle */}
            <div className="space-y-1">
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <input
                  id="account-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError('password');
                  }}
                  onBlur={(e) => handleBlur('password', e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:focus:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-11 pr-12 py-3.5 text-sm font-medium border border-slate-300 dark:border-slate-700/80 focus:border-[#800020] dark:focus:border-[#0047ff] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-rose-600 dark:text-rose-400 pl-1 pt-0.5">{fieldErrors.password}</p>
              )}
            </div>

            {/* Sub-row: Remember me (shadcn Checkbox) & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1 pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300 select-none">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                  className="accent-[#800020] dark:accent-[#0047ff] border-slate-400 dark:border-slate-600 data-[state=checked]:bg-[#800020] dark:data-[state=checked]:bg-[#0047ff] data-[state=checked]:border-[#800020] dark:data-[state=checked]:border-[#0047ff]"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setForgotPasswordOpen(true);
                  if (email) handleForgotPassword({ preventDefault: () => {} });
                }}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline transition-colors font-medium"
              >
                Forgot Password?
              </button>
            </div>

            {/* Password Reset Notification */}
            {forgotPasswordOpen && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-500/40 text-blue-800 dark:text-blue-200 text-xs">
                {resetEmailSent ? (
                  <p>Password reset link has been dispatched to your email address.</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <span>Send password reset link to {email || 'your email'}?</span>
                    <button
                      type="button"
                      disabled={isResettingPassword}
                      onClick={handleForgotPassword}
                      className="ml-2 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
                    >
                      {isResettingPassword ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Primary Action Button (Burgundy in light mode, Acid Blue in dark mode) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 bg-[#800020] hover:bg-[#6b001a] active:bg-[#570015] dark:bg-[#0047ff] dark:hover:bg-[#003be0] dark:active:bg-[#0030c0] text-white text-sm sm:text-base font-bold rounded-xl shadow-md shadow-[#800020]/20 dark:shadow-[#0047ff]/25 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span>{isRegisterMode ? 'Creating account…' : 'Logging in…'}</span>
                </>
              ) : (
                <span>{isRegisterMode ? 'Sign Up' : 'Log In'}</span>
              )}
            </button>
          </form>
        )}

        {/* OR Divider */}
        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
          <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            OR
          </span>
          <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
        </div>

        {/* Alternate Login Stack: Google & Email OTP (Uniform button sizes) */}
        <div className="space-y-2.5">
          {/* Google OAuth Login */}
          {googleEnabled && (
            <div
              ref={googleButtonRef}
              className={`w-full h-12 flex justify-center items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all [&>div]:!w-full [&>div]:!h-12 [&>div]:!flex [&>div]:!justify-center [&>div]:!items-center [&_iframe]:!w-full [&_iframe]:!h-12 [&_iframe]:!rounded-xl ${isSubmitting ? 'opacity-60 pointer-events-none' : ''}`}
            />
          )}

          {!googleEnabled && (
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={isGoogleSigningIn || isSubmitting}
              className="w-full h-12 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold px-4 rounded-xl flex items-center justify-center gap-3 border border-slate-200 dark:border-slate-800 shadow-sm transition-all text-sm sm:text-base active:scale-[0.99] cursor-pointer"
            >
              {isGoogleSigningIn ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" aria-hidden="true" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{isRegisterMode ? 'Sign up with Google' : 'Log in with Google'}</span>
            </button>
          )}

          {/* Email OTP Authentication Option */}
          {authMethod !== 'otp' && (
            <button
              type="button"
              onClick={() => {
                setAuthMethod('otp');
                onDismissSubmitError?.();
              }}
              className="w-full h-12 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/80 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold px-4 rounded-xl flex items-center justify-center gap-3 border border-slate-200 dark:border-slate-800 shadow-sm transition-all text-sm sm:text-base active:scale-[0.99] cursor-pointer"
            >
              <Mail className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Sign in with Email OTP</span>
            </button>
          )}
        </div>
      </div>

      {/* Docked bottom banner */}
      <div className="bg-slate-50 dark:bg-slate-950 py-4 px-6 text-center border-t border-slate-200 dark:border-white/5">
        {isRegisterMode ? (
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => handleModeChange('signin')}
              className="font-bold text-[#800020] dark:text-[#0047ff] hover:underline transition-colors focus:outline-none cursor-pointer"
            >
              Log In
            </button>
          </p>
        ) : (
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            New?{' '}
            <button
              type="button"
              onClick={() => handleModeChange('register')}
              className="font-bold text-[#800020] dark:text-[#0047ff] hover:underline transition-colors focus:outline-none cursor-pointer"
            >
              Sign up - and start commuting!
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
