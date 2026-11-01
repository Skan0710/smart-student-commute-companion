/**
 * Supabase Client Integration Module
 *
 * Provides a managed Supabase client for PostgreSQL cloud database operations.
 * - Initializes with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).
 * - Implements graceful fallback to local SQLite when credentials are not yet configured.
 * - Supports administrative service role operations for server-side repositories.
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabaseInstance = null;

/**
 * Initializes and returns the singleton Supabase client.
 * Returns null if Supabase is not configured in the environment.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
function getSupabaseClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const url = config.supabase?.url || process.env.SUPABASE_URL;
  const key =
    config.supabase?.serviceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    config.supabase?.anonKey ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.warn(`[Supabase] Client initialization failed: ${err.message}`);
    return null;
  }
}

/**
 * Checks whether Supabase is configured with valid credentials.
 * @returns {boolean}
 */
function isSupabaseConfigured() {
  const url = config.supabase?.url || process.env.SUPABASE_URL;
  const key =
    config.supabase?.serviceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    config.supabase?.anonKey ||
    process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

/**
 * Tests connection to the remote Supabase project.
 * @returns {Promise<{ ok: boolean, latencyMs?: number, error?: string }>}
 */
async function testSupabaseConnection() {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase credentials not configured in environment' };
  }

  const start = Date.now();
  try {
    // Probe users or system table
    const { error } = await client.from('users').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error && error.code !== 'PGRST116') {
      // If table doesn't exist yet, probe auth health
      const { error: authErr } = await client.auth.getSession();
      if (authErr) {
        return { ok: false, error: error.message || authErr.message };
      }
    }

    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getSupabaseClient,
  isSupabaseConfigured,
  testSupabaseConnection,
};

