/**
 * Abuse Protection & Deployment Security Tests
 *
 * - Rate limiter: windows, key isolation, failure-only counting, store sweeps.
 * - Login/registration/public-write limits actually activate over HTTP, and a
 *   victim is not locked out by an attacker's failed attempts.
 * - Signup honeypot rejects bot submissions without creating accounts.
 * - Security headers, no-store on auth responses, opt-in HSTS.
 * - HTTP->HTTPS redirect works behind a proxy and cannot loop; refuses unsafe config.
 * - CORS only admits configured origins; production never trusts localhost.
 * - Socket channel names are constrained.
 */

// Isolate from the development database: this suite registers users and stores hostile
// markup, so it must never run against backend/db/commute.db (the dev server's data).
const __os = require('os');
const __path = require('path');
const __fs = require('fs');
const isolatedDbPath = __path.join(__os.tmpdir(), `sscc-abuse-security-${process.pid}.db`);
for (const suffix of ['', '-shm', '-wal']) {
  try { __fs.unlinkSync(isolatedDbPath + suffix); } catch { /* not present */ }
}
process.env.DATABASE_PATH = isolatedDbPath;
process.on('exit', () => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { __fs.unlinkSync(isolatedDbPath + suffix); } catch { /* already gone */ }
  }
});

const assert = require('assert');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const { createApp } = require('../app');
const config = require('../config');
const { createRateLimiter, honeypot } = require('../middleware/rateLimiter');
const { resolveChannel, MAX_CHANNELS_PER_SOCKET } = require('../utils/socketChannels');
const { userRepository } = require('../repositories');

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

function startApp(appOptions) {
  const server = http.createServer(createApp(appOptions)).listen(0, '127.0.0.1');
  return new Promise(resolve => server.once('listening', () => resolve(server)));
}

function caller(server) {
  const { port } = server.address();
  return (method, p, { body, token, headers = {}, followRedirect = false } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : null;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path: p,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            ...headers
          }
        },
        res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(data);
            } catch {
              json = data;
            }
            resolve({ status: res.statusCode, body: json, headers: res.headers });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
}

async function run() {
  console.log('====================================================');
  console.log(' Abuse Protection & Deployment Security Suite');
  console.log('====================================================\n');

  // ---- Limiter unit behaviour ------------------------------------------------
  const run1 = (limiter, req = { ip: '9.9.9.9' }) =>
    new Promise(resolve => {
      const headers = {};
      const res = {
        statusCode: 200,
        setHeader: (k, v) => (headers[k] = v),
        on: (evt, fn) => (res._finish = fn)
      };
      limiter(req, res, err => resolve({ err, headers, res }));
    });

  await test('Limiter allows up to max per window, then blocks with Retry-After, then resets', async () => {
    let clock = 1000;
    const limiter = createRateLimiter({ name: 't', windowMs: 10000, max: 3, now: () => clock });
    for (let i = 0; i < 3; i++) assert.ifError((await run1(limiter)).err);
    const blocked = await run1(limiter);
    assert.strictEqual(blocked.err.statusCode, 429);
    assert.ok(Number(blocked.headers['Retry-After']) >= 1);
    clock += 10001;
    assert.ifError((await run1(limiter)).err, 'new window should allow again');
  });

  await test('Limiter keys are isolated and null keys are skipped', async () => {
    const limiter = createRateLimiter({ name: 't', windowMs: 10000, max: 1, keyFn: r => r.key });
    assert.ifError((await run1(limiter, { key: 'a' })).err);
    assert.strictEqual((await run1(limiter, { key: 'a' })).err.statusCode, 429);
    assert.ifError((await run1(limiter, { key: 'b' })).err);
    assert.ifError((await run1(limiter, { key: null })).err);
    assert.ifError((await run1(limiter, { key: null })).err);
  });

  await test('countOnlyFailures refunds successful responses', async () => {
    const limiter = createRateLimiter({ name: 't', windowMs: 10000, max: 2, countOnlyFailures: true });
    for (let i = 0; i < 5; i++) {
      const r = await run1(limiter);
      assert.ifError(r.err);
      r.res.statusCode = 200;
      r.res._finish();
    }
    for (let i = 0; i < 2; i++) {
      const r = await run1(limiter);
      assert.ifError(r.err);
      r.res.statusCode = 401;
      r.res._finish();
    }
    assert.strictEqual((await run1(limiter)).err.statusCode, 429);
  });

  await test('Expired entries are swept so the store cannot grow without bound', async () => {
    let clock = 0;
    const store = new Map();
    const limiter = createRateLimiter({ name: 't', windowMs: 1000, max: 5, keyFn: r => r.key, store, now: () => clock });
    for (let i = 0; i < 6000; i++) await run1(limiter, { key: `k${i}` });
    assert.ok(store.size >= 6000);
    clock += 5000;
    await run1(limiter, { key: 'fresh' });
    assert.ok(store.size < 10, `store should be swept, has ${store.size}`);
  });

  await test('Honeypot rejects filled traps and strips empty ones', async () => {
    const guard = honeypot('website');
    let rejected = null;
    guard({ body: { website: 'http://spam.example' } }, {}, err => (rejected = err));
    assert.strictEqual(rejected.code, 'REQUEST_REJECTED');
    const body = { website: '   ', email: 'a@b.c' };
    let passedThrough = false;
    guard({ body }, {}, err => (passedThrough = !err));
    assert.ok(passedThrough);
    assert.ok(!('website' in body));
  });

  // ---- HTTP behaviour: limits ------------------------------------------------
  const originalTrust = config.trustProxy;
  config.trustProxy = 1; // let the tests present different client IPs via X-Forwarded-For

  const stamp = Date.now();
  const password = 'StrongPass123';
  const victim = `victim_${stamp}@abuse.test`;
  userRepository.create({ email: victim, password, full_name: 'Victim User', college_name: 'DJ' });

  await test('Login throttling activates after repeated failures and returns 429 + Retry-After', async () => {
    const server = await startApp({ rateLimits: { loginAccount: { max: 3 } } });
    const call = caller(server);
    try {
      const attacker = { 'X-Forwarded-For': '203.0.113.7' };
      for (let i = 0; i < 3; i++) {
        const r = await call('POST', '/api/auth/login', { body: { email: victim, password: 'WrongPass999' }, headers: attacker });
        assert.strictEqual(r.status, 401);
      }
      const blocked = await call('POST', '/api/auth/login', { body: { email: victim, password: 'WrongPass999' }, headers: attacker });
      assert.strictEqual(blocked.status, 429);
      assert.strictEqual(blocked.body.code, 'RATE_LIMITED');
      assert.ok(blocked.headers['retry-after']);
      // even the right password is refused while throttled from that address
      const stillBlocked = await call('POST', '/api/auth/login', { body: { email: victim, password }, headers: attacker });
      assert.strictEqual(stillBlocked.status, 429);
    } finally {
      server.close();
    }
  });

  await test("An attacker's failures cannot lock the real user out from another address", async () => {
    const server = await startApp({ rateLimits: { loginAccount: { max: 3 } } });
    const call = caller(server);
    try {
      for (let i = 0; i < 4; i++) {
        await call('POST', '/api/auth/login', { body: { email: victim, password: 'WrongPass999' }, headers: { 'X-Forwarded-For': '203.0.113.7' } });
      }
      const real = await call('POST', '/api/auth/login', { body: { email: victim, password }, headers: { 'X-Forwarded-For': '198.51.100.20' } });
      assert.strictEqual(real.status, 200);
    } finally {
      server.close();
    }
  });

  await test('Successful logins do not consume the per-account failure budget', async () => {
    const server = await startApp({ rateLimits: { loginAccount: { max: 2 } } });
    const call = caller(server);
    try {
      const ip = { 'X-Forwarded-For': '192.0.2.50' };
      for (let i = 0; i < 6; i++) {
        const r = await call('POST', '/api/auth/login', { body: { email: victim, password }, headers: ip });
        assert.strictEqual(r.status, 200, `login ${i} should succeed`);
      }
    } finally {
      server.close();
    }
  });

  await test('Per-IP login limit covers credential stuffing across many accounts', async () => {
    const server = await startApp({ rateLimits: { loginIp: { max: 4 } } });
    const call = caller(server);
    try {
      const ip = { 'X-Forwarded-For': '192.0.2.99' };
      let last;
      for (let i = 0; i < 5; i++) {
        last = await call('POST', '/api/auth/login', { body: { email: `nobody${i}@abuse.test`, password: 'WrongPass999' }, headers: ip });
      }
      assert.strictEqual(last.status, 429);
    } finally {
      server.close();
    }
  });

  await test('Registration is rate limited and the honeypot blocks bot signups', async () => {
    const server = await startApp({ rateLimits: { register: { max: 2 } } });
    const call = caller(server);
    try {
      const ip = { 'X-Forwarded-For': '192.0.2.77' };
      const botEmail = `bot_${stamp}@abuse.test`;
      const bot = await call('POST', '/api/auth/register', {
        body: { email: botEmail, password, full_name: 'Bot Net', college_name: 'Bots', website: 'http://spam.example' },
        headers: ip
      });
      assert.strictEqual(bot.status, 400);
      assert.strictEqual(bot.body.code, 'REQUEST_REJECTED');
      assert.strictEqual(userRepository.findByEmail(botEmail), null, 'bot account must not exist');

      const human = await call('POST', '/api/auth/register', {
        body: { email: `human_${stamp}@abuse.test`, password, full_name: 'Human One', college_name: 'DJ' },
        headers: ip
      });
      assert.strictEqual(human.status, 201);
      const third = await call('POST', '/api/auth/register', {
        body: { email: `human2_${stamp}@abuse.test`, password, full_name: 'Human Two', college_name: 'DJ' },
        headers: ip
      });
      assert.strictEqual(third.status, 429, 'budget of 2 attempts (bot + human) is spent');
    } finally {
      server.close();
    }
  });

  await test('Anonymous community writes are throttled per client', async () => {
    const server = await startApp({ rateLimits: { publicWrite: { max: 2 } } });
    const call = caller(server);
    try {
      const ip = { 'X-Forwarded-For': '192.0.2.88' };
      const fb = { is_useful: true, comment: 'ok' };
      assert.strictEqual((await call('POST', '/api/feedback', { body: fb, headers: ip })).status, 201);
      assert.strictEqual((await call('POST', '/api/feedback', { body: fb, headers: ip })).status, 201);
      assert.strictEqual((await call('POST', '/api/feedback', { body: fb, headers: ip })).status, 429);
      // a different client is unaffected
      assert.strictEqual((await call('POST', '/api/feedback', { body: fb, headers: { 'X-Forwarded-For': '192.0.2.89' } })).status, 201);
    } finally {
      server.close();
    }
  });

  // ---- Headers ---------------------------------------------------------------
  await test('API responses carry hardening headers; auth responses are no-store; no X-Powered-By', async () => {
    const server = await startApp();
    const call = caller(server);
    try {
      const res = await call('GET', '/api/health');
      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
      assert.strictEqual(res.headers['referrer-policy'], 'no-referrer');
      assert.strictEqual(res.headers['x-frame-options'], 'DENY');
      assert.ok(res.headers['content-security-policy'].includes("default-src 'none'"));
      assert.ok(res.headers['content-security-policy'].includes("frame-ancestors 'none'"));
      assert.ok(res.headers['permissions-policy'].includes('geolocation=()'));
      assert.ok(!('x-powered-by' in res.headers));
      assert.ok(!('strict-transport-security' in res.headers), 'HSTS is opt-in');

      const auth = await call('POST', '/api/auth/login', { body: { email: victim, password }, headers: { 'X-Forwarded-For': '192.0.2.120' } });
      assert.strictEqual(auth.headers['cache-control'], 'no-store');
      const authed = await call('GET', '/api/student/dashboard', { token: auth.body.token });
      assert.strictEqual(authed.headers['cache-control'], 'no-store');
      // headers are present on error responses too
      const missing = await call('GET', '/api/does-not-exist');
      assert.strictEqual(missing.status, 404);
      assert.strictEqual(missing.headers['x-content-type-options'], 'nosniff');
    } finally {
      server.close();
    }
  });

  await test('HSTS is sent only when enabled AND the request arrived over HTTPS', async () => {
    const previous = config.enableHsts;
    config.enableHsts = true;
    const server = await startApp();
    const call = caller(server);
    try {
      const secure = await call('GET', '/api/health', { headers: { 'X-Forwarded-Proto': 'https' } });
      assert.ok(/max-age=\d+/.test(secure.headers['strict-transport-security'] || ''));
      const plain = await call('GET', '/api/health', { headers: { 'X-Forwarded-Proto': 'http' } });
      assert.ok(!('strict-transport-security' in plain.headers));
    } finally {
      config.enableHsts = previous;
      server.close();
    }
  });

  // ---- HTTPS enforcement -----------------------------------------------------
  await test('FORCE_HTTPS redirects plain HTTP once, never loops, and spares health checks', async () => {
    const previous = config.forceHttps;
    config.forceHttps = true;
    const server = await startApp();
    const call = caller(server);
    try {
      const plain = await call('GET', '/api/ride-groups?limit=1', { headers: { Host: 'app.example.org' } });
      assert.strictEqual(plain.status, 308);
      assert.strictEqual(plain.headers.location, 'https://app.example.org/api/ride-groups?limit=1');

      const viaProxy = await call('GET', '/api/ride-groups?limit=1', { headers: { Host: 'app.example.org', 'X-Forwarded-Proto': 'https' } });
      assert.strictEqual(viaProxy.status, 200, 'HTTPS (as reported by the proxy) must not redirect again');

      const post = await call('POST', '/api/feedback', { body: { is_useful: true }, headers: { Host: 'app.example.org' } });
      assert.strictEqual(post.status, 426, 'unsafe methods are refused, not silently replayed');

      const health = await call('GET', '/health');
      assert.strictEqual(health.status, 200);
    } finally {
      config.forceHttps = previous;
      server.close();
    }
  });

  await test('FORCE_HTTPS without TRUST_PROXY is rejected at startup (would redirect forever)', () => {
    assert.throws(() => config.validateEnv({ FORCE_HTTPS: 'true' }), /FORCE_HTTPS requires TRUST_PROXY/);
    assert.doesNotThrow(() => config.validateEnv({ FORCE_HTTPS: 'true', TRUST_PROXY: '1' }));
  });

  // ---- CORS ------------------------------------------------------------------
  await test('CORS admits only configured origins and never allows credentials', async () => {
    const server = await startApp();
    const call = caller(server);
    try {
      const allowed = await call('GET', '/api/health', { headers: { Origin: config.allowedOrigins[0] } });
      assert.strictEqual(allowed.headers['access-control-allow-origin'], config.allowedOrigins[0]);
      assert.ok(!('access-control-allow-credentials' in allowed.headers));
      const evil = await call('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
      assert.ok(!('access-control-allow-origin' in evil.headers));
    } finally {
      server.close();
    }
  });

  await test('Production never trusts localhost origins', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', "process.stdout.write(JSON.stringify(require('./config').allowedOrigins))"],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'production', CLIENT_URL: 'https://app.example.org', JWT_SECRET: 'p'.repeat(40) },
        encoding: 'utf8'
      }
    );
    assert.deepStrictEqual(JSON.parse(out), ['https://app.example.org']);
  });

  // ---- Socket channels -------------------------------------------------------
  await test('Socket channel names are constrained in shape and count', () => {
    assert.deepStrictEqual(resolveChannel({ area: 'mumbai_general' }, 1), { ok: true, channel: 'mumbai_general' });
    assert.deepStrictEqual(resolveChannel({}, 1), { ok: true, channel: 'mumbai_general' });
    assert.deepStrictEqual(resolveChannel(undefined, 1), { ok: true, channel: 'mumbai_general' });
    for (const bad of ['../../etc', 'a b', 'x'.repeat(51), '<script>', '-leading-dash']) {
      assert.strictEqual(resolveChannel({ area: bad }, 1).ok, false, `should reject ${JSON.stringify(bad)}`);
    }
    // Non-string or empty input is ignored and falls back to the default channel
    for (const odd of [{ toString: 1 }, 42, '', null]) {
      assert.deepStrictEqual(resolveChannel({ area: odd }, 1), { ok: true, channel: 'mumbai_general' });
    }
    assert.strictEqual(resolveChannel({ area: 'ok' }, MAX_CHANNELS_PER_SOCKET + 1).ok, false);
    assert.strictEqual(resolveChannel({ area: 'ok' }, MAX_CHANNELS_PER_SOCKET).ok, true);
  });

  config.trustProxy = originalTrust;
  console.log('\n----------------------------------------------------');
  console.log(` ABUSE/DEPLOYMENT SECURITY SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
