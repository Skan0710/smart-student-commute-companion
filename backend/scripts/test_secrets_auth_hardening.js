/**
 * Secrets, Token, Password and Google Sign-In Hardening Tests
 *
 * - JWT secret: required in production, random per process otherwise, and the
 *   old published default no longer verifies tokens.
 * - Token verification rejects alg=none, missing expiry, wrong secret, tampering.
 * - Password hashes carry their scrypt parameters; legacy hashes still verify
 *   and are upgraded on login.
 * - Google sign-in is verified server-side (audience, issuer, expiry, verified
 *   email) and never trusts client-supplied identity.
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const { createApp } = require('../app');
const config = require('../config');
const { validateEnv } = config;
const { signToken, verifyToken } = require('../utils/token');
const { hashPassword, verifyPassword, needsRehash } = require('../utils/password');
const { verifyGoogleIdToken } = require('../services/googleIdentityService');
const { authService } = require('../services/authService');
const { userRepository } = require('../repositories');
const { UnauthorizedError, ServiceUnavailableError } = require('../errors');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function forgeToken(header, payload, secret) {
  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

function readJwtSecretFromFreshProcess() {
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(require('./config').jwtSecret)"],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, JWT_SECRET: '', NODE_ENV: 'development' },
      encoding: 'utf8'
    }
  );
  return out;
}

async function run() {
  console.log('====================================================');
  console.log(' Secrets / Auth / Session Hardening Test Suite');
  console.log('====================================================\n');

  // ---- JWT secret policy ---------------------------------------------------
  await test('Production refuses to start without a strong JWT_SECRET', () => {
    const base = { NODE_ENV: 'production', CLIENT_URL: 'https://app.example.org' };
    assert.throws(() => validateEnv({ ...base }), /JWT_SECRET is required in production/);
    assert.throws(() => validateEnv({ ...base, JWT_SECRET: 'too-short' }), /JWT_SECRET is required in production/);
    assert.doesNotThrow(() => validateEnv({ ...base, JWT_SECRET: 'x'.repeat(40) }));
  });

  await test('Without JWT_SECRET each process gets a different random signing secret', () => {
    const a = readJwtSecretFromFreshProcess();
    const b = readJwtSecretFromFreshProcess();
    assert.ok(a.length >= 64 && b.length >= 64);
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(a, 'smart-commute-companion-dev-jwt-secret-key-32bytes-secure!');
  });

  await test('Sanitized config never reveals secrets', () => {
    const dump = JSON.stringify(config.toSanitizedObject());
    assert.ok(!dump.includes(config.jwtSecret));
    assert.ok(dump.includes('[REDACTED]'));
  });

  // ---- Token verification --------------------------------------------------
  const claims = { sub: 'usr-1', email: 'a@b.test', role: 'student' };

  await test('Tokens signed with the former published default secret are rejected', () => {
    const forged = signToken(claims, {
      secret: 'smart-commute-companion-dev-jwt-secret-key-32bytes-secure!'
    });
    assert.throws(() => verifyToken(forged), UnauthorizedError);
  });

  await test('alg=none and unknown algorithms are rejected', () => {
    const now = Math.floor(Date.now() / 1000);
    const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ ...claims, exp: now + 60 })}.`;
    assert.throws(() => verifyToken(none), UnauthorizedError);
    const hs512 = forgeToken({ alg: 'HS512', typ: 'JWT' }, { ...claims, exp: now + 60 }, config.jwtSecret);
    assert.throws(() => verifyToken(hs512), /Unsupported token algorithm/);
  });

  await test('A validly signed token without an expiry is rejected', () => {
    const noExp = forgeToken({ alg: 'HS256', typ: 'JWT' }, claims, config.jwtSecret);
    assert.throws(() => verifyToken(noExp), /no expiry/);
  });

  await test('A validly signed token without a subject is rejected', () => {
    const now = Math.floor(Date.now() / 1000);
    const noSub = forgeToken({ alg: 'HS256', typ: 'JWT' }, { role: 'admin', exp: now + 60 }, config.jwtSecret);
    assert.throws(() => verifyToken(noSub), UnauthorizedError);
  });

  await test('Tampered payloads and expired tokens are rejected; good tokens verify', () => {
    const good = signToken(claims, { expiresIn: 60 });
    assert.strictEqual(verifyToken(good).sub, 'usr-1');
    const [h, , s] = good.split('.');
    const tampered = `${h}.${b64url({ ...claims, role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 })}.${s}`;
    assert.throws(() => verifyToken(tampered), /signature/);
    assert.throws(() => verifyToken(signToken(claims, { expiresIn: -5 })), /expired/);
  });

  // ---- Password hashing ------------------------------------------------------
  await test('New hashes embed scrypt parameters, are salted, and verify', () => {
    const h1 = hashPassword('CorrectHorse1');
    const h2 = hashPassword('CorrectHorse1');
    assert.notStrictEqual(h1, h2);
    assert.ok(h1.startsWith('scrypt:32768:8:1:'));
    assert.ok(verifyPassword('CorrectHorse1', h1));
    assert.ok(!verifyPassword('correcthorse1', h1));
    assert.strictEqual(needsRehash(h1), false);
  });

  await test('Legacy salt:hash entries still verify and are flagged for upgrade', () => {
    const salt = crypto.randomBytes(16).toString('hex');
    const legacy = `${salt}:${crypto.scryptSync('LegacyPass1', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
    assert.ok(verifyPassword('LegacyPass1', legacy));
    assert.ok(!verifyPassword('LegacyPass2', legacy));
    assert.strictEqual(needsRehash(legacy), true);
  });

  await test('Malformed or abusive hash parameters are rejected, not executed', () => {
    assert.strictEqual(verifyPassword('x', 'scrypt:99999999999:8:1:aa:bb'), false);
    assert.strictEqual(verifyPassword('x', 'scrypt:3:8:1:aa:bb'), false); // not a power of two
    assert.strictEqual(verifyPassword('x', 'garbage'), false);
    assert.strictEqual(needsRehash('garbage'), false);
  });

  await test('Login upgrades a legacy hash in place and the password still works', () => {
    const email = `legacy_${Date.now()}@hash.test`;
    const user = userRepository.create({
      email,
      password: 'LegacyPass1',
      full_name: 'Legacy User',
      college_name: 'DJ Sanghvi'
    });
    const salt = crypto.randomBytes(16).toString('hex');
    const legacy = `${salt}:${crypto.scryptSync('LegacyPass1', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
    userRepository.update(user.id, { password_hash: legacy });

    authService.login({ email, password: 'LegacyPass1' });

    const stored = userRepository.findById(user.id).password_hash;
    assert.ok(stored.startsWith('scrypt:32768:8:1:'), 'hash should have been upgraded');
    authService.login({ email, password: 'LegacyPass1' }); // still works after upgrade
    assert.throws(() => authService.login({ email, password: 'Wrong1234' }), UnauthorizedError);
  });

  // ---- Google ID token verification ------------------------------------------
  const CLIENT = 'test-client-id.apps.googleusercontent.com';
  const validClaims = () => ({
    aud: CLIENT,
    iss: 'https://accounts.google.com',
    exp: String(Math.floor(Date.now() / 1000) + 600),
    email: 'Student@Example.edu',
    email_verified: 'true',
    name: 'Student Example',
    sub: '1234567890'
  });
  const fakeHttp = data => ({ get: async () => ({ data }) });

  await test('Valid Google token yields a normalized verified profile', async () => {
    const profile = await verifyGoogleIdToken('t'.repeat(30), { clientId: CLIENT, http: fakeHttp(validClaims()) });
    assert.strictEqual(profile.email, 'student@example.edu');
    assert.strictEqual(profile.sub, '1234567890');
  });

  await test('Google tokens with wrong audience/issuer/expiry/unverified email are rejected', async () => {
    const bad = [
      { ...validClaims(), aud: 'someone-elses-client' },
      { ...validClaims(), iss: 'https://evil.example' },
      { ...validClaims(), exp: String(Math.floor(Date.now() / 1000) - 10) },
      { ...validClaims(), email_verified: 'false' },
      { ...validClaims(), email: undefined }
    ];
    for (const claims of bad) {
      await assert.rejects(
        verifyGoogleIdToken('t'.repeat(30), { clientId: CLIENT, http: fakeHttp(claims) }),
        UnauthorizedError
      );
    }
  });

  await test('Google rejection (400) is a 401; upstream failure and missing config are 503', async () => {
    const reject400 = { get: async () => { const e = new Error('bad'); e.response = { status: 400 }; throw e; } };
    const down = { get: async () => { throw new Error('ECONNRESET'); } };
    await assert.rejects(verifyGoogleIdToken('t'.repeat(30), { clientId: CLIENT, http: reject400 }), UnauthorizedError);
    await assert.rejects(verifyGoogleIdToken('t'.repeat(30), { clientId: CLIENT, http: down }), ServiceUnavailableError);
    await assert.rejects(verifyGoogleIdToken('t'.repeat(30), { clientId: '', http: fakeHttp(validClaims()) }), ServiceUnavailableError);
  });

  await test('Google login provisions a student, never an admin, and reuses the account', () => {
    const email = `g_${Date.now()}@google.test`;
    const first = authService.loginWithGoogle({ email, name: 'Gee Student' });
    assert.strictEqual(first.user.role, 'student');
    assert.ok(!('password_hash' in first.user));
    const second = authService.loginWithGoogle({ email, name: 'Different Name' });
    assert.strictEqual(second.user.id, first.user.id);
    // The random password is not guessable via the password endpoint
    assert.throws(() => authService.login({ email, password: 'Password123' }), UnauthorizedError);
  });

  await test('POST /api/auth/google: 503 when unconfigured, 401 for bad token, 200 + usable session when valid', async () => {
    const server = http.createServer(createApp()).listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();
    const call = (method, p, body, token) =>
      new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
          {
            host: '127.0.0.1', port, method, path: p,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
          },
          res => {
            let d = '';
            res.on('data', c => (d += c));
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d || 'null') }));
          }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
      });

    const realGet = axios.get;
    const realClient = config.googleClientId;
    try {
      config.googleClientId = '';
      assert.strictEqual((await call('POST', '/api/auth/google', { credential: 'c'.repeat(40) })).status, 503);

      config.googleClientId = CLIENT;
      axios.get = async () => { const e = new Error('invalid'); e.response = { status: 400 }; throw e; };
      assert.strictEqual((await call('POST', '/api/auth/google', { credential: 'c'.repeat(40) })).status, 401);
      assert.strictEqual((await call('POST', '/api/auth/google', { credential: 'short' })).status, 400);

      const email = `api_${Date.now()}@google.test`;
      axios.get = async () => ({ data: { ...validClaims(), email } });
      const ok = await call('POST', '/api/auth/google', { credential: 'c'.repeat(40) });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.body.user.email, email);
      const me = await call('GET', '/api/auth/me', null, ok.body.token);
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.body.user.role, 'student');
    } finally {
      axios.get = realGet;
      config.googleClientId = realClient;
      server.close();
    }
  });

  console.log('\n----------------------------------------------------');
  console.log(` SECRETS/AUTH HARDENING SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
