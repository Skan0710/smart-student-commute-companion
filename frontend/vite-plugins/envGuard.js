/**
 * Build-time guard: private credentials must never reach the browser bundle.
 *
 * Vite only exposes variables prefixed with VITE_, and `envDir` points at the
 * repository root where the backend's secrets also live. This plugin makes the
 * failure mode loud instead of silent:
 *  1. it refuses to build if a VITE_-prefixed variable *name* looks like a
 *     private credential (someone "helpfully" prefixed a secret), and
 *  2. after bundling it refuses to emit any chunk containing the literal value
 *     of a known backend secret.
 */

import { loadEnv } from 'vite';

/** Names that must never be exposed through a VITE_ variable. */
const SECRET_NAME = /(SERVICE_ROLE|JWT_SECRET|PRIVATE_KEY|CLIENT_SECRET|GROQ_API|GEMINI_API|DATABASE_URL|DB_PASSWORD|SECRET_KEY)/i;

/** Backend-only variables whose *values* must never appear in the bundle. */
const BACKEND_SECRET_KEYS = [
  'JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY'
];

/** @param {Record<string,string>} env */
export function findExposedSecretNames(env) {
  return Object.keys(env).filter(
    (key) => key.startsWith('VITE_') && SECRET_NAME.test(key)
  );
}

export default function envGuard() {
  let secretValues = [];

  return {
    name: 'env-guard',
    configResolved(config) {
      const exposed = findExposedSecretNames(
        loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_')
      );
      if (exposed.length) {
        throw new Error(
          `[env-guard] ${exposed.join(', ')} would be exposed to the browser. ` +
            'Private credentials must not use the VITE_ prefix; keep them in backend-only variables.'
        );
      }
      // Values come from every env source, not just VITE_-prefixed ones.
      const all = loadEnv(config.mode, config.envDir || process.cwd(), '');
      secretValues = BACKEND_SECRET_KEYS
        .map((key) => ({ key, value: (all[key] || process.env[key] || '').trim() }))
        .filter(({ value }) => value.length >= 16);
    },
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        const body = chunk.type === 'chunk' ? chunk.code : String(chunk.source || '');
        for (const { key, value } of secretValues) {
          if (body.includes(value)) {
            throw new Error(`[env-guard] The value of ${key} was found in ${fileName}. Aborting build.`);
          }
        }
      }
    }
  };
}
