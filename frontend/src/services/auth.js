import { request, FrontendApiError } from './api.js';
import {
  readAuthSession,
  writeAuthSession,
  clearAuthSession,
  AUTH_SESSION_EXPIRED_EVENT,
} from '../utils/authSession.js';

/**
 * Authentication Service (Day 14 — Student Account)
 *
 * Talks to the REAL backend auth contract — nothing here is simulated:
 *
 * - `POST /api/auth/register` — public; creates the account (201)
 * - `POST /api/auth/login`    — public; returns `{ token, user }`
 * - `POST /api/auth/google`   — public; verifies a Google ID token server-side
 * - `GET  /api/auth/me`       — Bearer-authenticated profile verification
 * - `PATCH /api/auth/users/:id` — updates student profile details
 *
 * Successful sign-in persists the session through `utils/authSession.js`
 * (device-local, password never stored). The `Authorization: Bearer` header
 * for authenticated calls is attached centrally by `services/api.js`.
 */

/**
 * Sign in with email + password.
 *
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<{token: string, user: Object, savedAt: string}>} stored session
 * @throws {FrontendApiError} 401 for bad credentials, network errors, malformed responses
 */
export async function signIn({ email, password }) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!data?.token || !data?.user) {
    throw new FrontendApiError(
      'The server returned an unexpected sign-in response. Please try again.',
      null,
      false
    );
  }

  writeAuthSession({ token: data.token, user: data.user });
  return readAuthSession();
}

/**
 * Sign in with a Google ID token (the `credential` from Google Identity
 * Services). The backend verifies it with Google; the browser's claim about
 * who the user is is never trusted.
 *
 * @param {string} credential - Google ID token
 * @returns {Promise<{token: string, user: Object, savedAt: string}>} stored session
 * @throws {FrontendApiError} 401 when Google verification fails, 503 when Google
 *   sign-in is not configured/available, network errors, malformed responses
 */
export async function signInWithGoogle(credential) {
  const data = await request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });

  if (!data?.token || !data?.user) {
    throw new FrontendApiError(
      'The server returned an unexpected Google sign-in response. Please try again.',
      null,
      false
    );
  }

  writeAuthSession({ token: data.token, user: data.user });
  return readAuthSession();
}

/**
 * Register a new student account.
 *
 * The backend register endpoint returns { message, user } on 201 without a
 * token, so we immediately sign in with the new credentials so the student
 * lands in a verified session without typing the password twice.
 *
 * @param {{email: string, password: string, full_name?: string, college_name?: string}} payload
 * @returns {Promise<{token: string, user: Object, savedAt: string}>} stored session
 * @throws {FrontendApiError} 409 when email taken, 400 for bad password/email
 */
export async function registerAccount(payload) {
  const data = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!data?.user) {
    throw new FrontendApiError(
      'The server returned an unexpected registration response. Please try again.',
      null,
      false
    );
  }

  try {
    return await signIn({ email: payload.email, password: payload.password });
  } catch (err) {
    if (err instanceof FrontendApiError) {
      throw new FrontendApiError(
        `Your account was created, but automatic sign-in failed: ${err.message}`,
        err.status,
        err.isNetwork
      );
    }
    throw err;
  }
}

/**
 * Fetch the currently authenticated user's profile from the server.
 *
 * Called on launch and on network recovery to verify that the token saved on
 * this device is still accepted by the backend. If the server returns 401
 * (expired, revoked or invalidated), the local session is dropped and
 * listeners are notified.
 *
 * @returns {Promise<{token: string, user: Object, savedAt: string}|null>}
 */
export async function fetchCurrentUser() {
  const stored = readAuthSession();
  if (!stored?.token) return null;

  try {
    const data = await request('/auth/me');
    if (!data?.user) {
      throw new FrontendApiError(
        'The server returned an unexpected profile response.',
        null,
        false
      );
    }

    // Refresh the cached profile with the server's authoritative copy.
    writeAuthSession({ token: stored.token, user: data.user });
    return readAuthSession();
  } catch (err) {
    if (err instanceof FrontendApiError && (err.status === 401 || err.status === 404)) {
      clearAuthSession();
      // 401 is broadcast by the API layer; a 404 means the account itself
      // is gone, so broadcast the same "session no longer valid" signal.
      if (err.status === 404 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
      }
      return null;
    }
    throw err;
  }
}

/**
 * Update the student profile details on the backend and sync local session.
 *
 * @param {string} userId
 * @param {{full_name?: string, college_name?: string, preferred_corridor?: string, home_station?: string}} payload
 * @returns {Promise<Object>}
 */
export async function updateUserProfile(userId, payload) {
  if (!userId) {
    // If guest or no userId, save to local session
    const session = readAuthSession();
    const updatedUser = { ...(session?.user || {}), ...payload };
    if (session?.token) {
      writeAuthSession({ token: session.token, user: updatedUser });
    }
    return updatedUser;
  }

  try {
    const data = await request(`/auth/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const updatedUser = data?.user || { ...payload, id: userId };
    const session = readAuthSession();
    if (session?.token) {
      writeAuthSession({ token: session.token, user: { ...session.user, ...updatedUser } });
    }
    return updatedUser;
  } catch (err) {
    // If server update fails (e.g. offline or unauthorized), still save locally
    const session = readAuthSession();
    const updatedUser = { ...(session?.user || {}), ...payload, id: userId };
    if (session?.token) {
      writeAuthSession({ token: session.token, user: updatedUser });
    }
    return updatedUser;
  }
}

/**
 * Sign out: drop the session from this device.
 * The token cannot be revoked server-side (the backend contract has no
 * logout endpoint), which is documented as a known limitation.
 *
 * @returns {null}
 */
export function signOut() {
  clearAuthSession();
  return null;
}
