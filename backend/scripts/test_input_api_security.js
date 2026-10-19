/**
 * Input Validation & API Response Security Tests
 *
 * - Oversized and malformed bodies are rejected, never crash the server.
 * - User-supplied links can only be http(s); bulk operations are bounded.
 * - Adversarial strings are treated as data by every query (parameterized).
 * - Hostile markup is stored and returned as inert JSON text.
 * - Vote identity cannot be forged with garbage/oversized tokens.
 * - API responses never contain credential or internal-ownership fields.
 * - Unexpected errors do not leak stack traces unless NODE_ENV is explicit dev/test.
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const create = require('../routes');
const { errorHandler } = require('../middleware/errorHandler');
const { feedbackRepository } = require('../repositories/FeedbackRepository');
const { getConnection } = require('../db/connection');

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

function makeCaller(server) {
  const { port } = server.address();
  return (method, path, { body, token, headers = {}, raw } = {}) =>
    new Promise((resolve, reject) => {
      const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
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

const FORBIDDEN_KEYS = ['password', 'password_hash', 'passwordhash', 'jwt', 'secret', 'api_key', 'apikey', 'creator_user_id'];

function findForbiddenKeys(value, trail = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenKeys(v, `${trail}[${i}]`, hits));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k.toLowerCase())) hits.push(`${trail}.${k}`);
      findForbiddenKeys(v, `${trail}.${k}`, hits);
    }
  }
  return hits;
}

async function run() {
  console.log('====================================================');
  console.log(' Input Validation & API Response Security Suite');
  console.log('====================================================\n');

  const server = http.createServer(createApp()).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const call = makeCaller(server);

  const email = `inputsec_${Date.now()}@sec.test`;
  const password = 'StrongPass123';
  await call('POST', '/api/auth/register', {
    body: { email, password, full_name: 'Input Sec', college_name: 'DJ Sanghvi' }
  });
  const login = await call('POST', '/api/auth/login', { body: { email, password } });
  const token = login.body.token;

  // ---- Body handling -------------------------------------------------------
  await test('Bodies over the size limit are rejected with 413, not processed', async () => {
    const res = await call('POST', '/api/feedback', {
      body: { is_useful: true, comment: 'x'.repeat(300 * 1024) }
    });
    assert.strictEqual(res.status, 413);
  });

  await test('Malformed JSON gets a 400 without leaking internals', async () => {
    const res = await call('POST', '/api/feedback', { raw: '{"is_useful": tru' });
    assert.strictEqual(res.status, 400);
    assert.ok(!JSON.stringify(res.body).includes('node_modules'));
    assert.ok(!('stack' in res.body));
  });

  await test('Over-long fields and wrong types are rejected by validation', async () => {
    const long = await call('POST', '/api/feedback', { body: { is_useful: true, comment: 'c'.repeat(1001) } });
    assert.strictEqual(long.status, 400);
    const wrong = await call('POST', '/api/feedback', { body: { is_useful: 'yes' } });
    assert.strictEqual(wrong.status, 400);
    const tags = await call('POST', '/api/feedback', { body: { is_useful: true, tags: Array(11).fill('t') } });
    assert.strictEqual(tags.status, 400);
  });

  // ---- Link safety & bounded bulk operations ---------------------------------
  await test('Study resource links must be http(s); script-bearing schemes are rejected', async () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', 'not a url']) {
      const res = await call('POST', '/api/student/resources', {
        token,
        body: { title: 'Notes', resource_type: 'link', url: bad }
      });
      assert.strictEqual(res.status, 400, `expected 400 for ${bad}, got ${res.status}`);
    }
    const ok = await call('POST', '/api/student/resources', {
      token,
      body: { title: 'Notes', resource_type: 'link', url: 'https://example.org/notes' }
    });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  });

  await test('Bulk notification updates are capped', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `n-${i}`);
    const res = await call('POST', '/api/notifications/read-multiple', { token, body: { ids } });
    assert.strictEqual(res.status, 400);
  });

  // ---- Injection & markup ----------------------------------------------------
  await test('SQL metacharacters are inert in repository filters and search endpoints', async () => {
    const payloads = ["x' OR '1'='1", "'; DROP TABLE users; --", '" OR ""="', '%\' UNION SELECT password_hash FROM users --'];
    const usersBefore = getConnection().prepare('SELECT COUNT(*) AS c FROM users').get().c;
    for (const p of payloads) {
      const rows = feedbackRepository.findWithPagination({ recommendation_id: p });
      assert.strictEqual(rows.total, 0, 'injection string must match nothing');
      for (const path of [`/api/student/search?q=${encodeURIComponent(p)}`, `/api/transit/search?query=${encodeURIComponent(p)}`]) {
        const res = await call('GET', path, { token });
        assert.ok(res.status < 500, `${path} returned ${res.status}`);
        assert.deepStrictEqual(findForbiddenKeys(res.body), [], 'injection must not surface credential columns');
      }
    }
    const usersAfter = getConnection().prepare('SELECT COUNT(*) AS c FROM users').get().c;
    assert.ok(usersAfter >= usersBefore, 'users table must be intact');
  });

  await test('Hostile markup is stored verbatim and returned only as JSON data', async () => {
    const message = '<img src=x onerror=alert(1)> <script>alert(2)</script>';
    const res = await call('POST', '/api/live-reports', {
      body: { pseudonym: 'Reporter', area: 'Dadar', mode: 'train', message, impact: 'low' }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.report.message, message);
    const list = await call('GET', '/api/live-reports?limit=5');
    assert.ok(String(list.headers['content-type']).startsWith('application/json'));
  });

  // ---- Vote identity ---------------------------------------------------------
  await test('Garbage or oversized x-user-token cannot be used to stuff votes', async () => {
    const created = await call('POST', '/api/live-reports', {
      body: { pseudonym: 'VoteTest', area: 'Bandra', mode: 'bus', message: 'Road blocked near station', impact: 'medium' }
    });
    const id = created.body.report.id;
    const first = await call('POST', `/api/live-reports/${id}/confirm`, { headers: { 'x-user-token': 'a'.repeat(500) } });
    assert.strictEqual(first.status, 200);
    const second = await call('POST', `/api/live-reports/${id}/confirm`, { headers: { 'x-user-token': '<script>' } });
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.body.alreadyVoted, true, 'invalid tokens collapse to one identity (the client IP)');
    // A well-formed pseudonym token is accepted as a distinct voter
    const third = await call('POST', `/api/live-reports/${id}/confirm`, { headers: { 'x-user-token': 'browser-token-12345' } });
    assert.ok(!third.body.alreadyVoted, 'a well-formed token is a distinct voter');
  });

  // ---- Response minimization -------------------------------------------------
  await test('No GET endpoint returns credential or internal-ownership fields', async () => {
    const eps = [];
    (function walk(stack) {
      for (const l of stack) {
        if (l.route && l.route.methods.get && !l.route.path.includes(':')) eps.push(`/api${l.route.path}`);
        else if (l.handle && l.handle.stack) walk(l.handle.stack);
      }
    })(create(null).stack);

    const offenders = [];
    for (const path of eps) {
      const res = await call('GET', path, { token });
      for (const hit of findForbiddenKeys(res.body)) offenders.push(`${path} ${hit}`);
    }
    // Account endpoints specifically
    const me = await call('GET', '/api/auth/me', { token });
    assert.deepStrictEqual(findForbiddenKeys(me.body), []);
    assert.deepStrictEqual(offenders, [], `sensitive fields exposed: ${offenders.join(', ')}`);
    assert.ok(eps.length > 20, 'sanity: scanned many endpoints');
  });

  await test('Login and registration responses never include the password hash', async () => {
    assert.deepStrictEqual(findForbiddenKeys(login.body), []);
    const reg = await call('POST', '/api/auth/register', {
      body: { email: `again_${Date.now()}@sec.test`, password, full_name: 'Second User', college_name: 'DJ' }
    });
    assert.deepStrictEqual(findForbiddenKeys(reg.body), []);
  });

  // ---- Error handler ---------------------------------------------------------
  await test('Unexpected errors expose no stack/message unless NODE_ENV is explicit dev/test', () => {
    const original = process.env.NODE_ENV;
    const quiet = { log: console.error, warn: console.warn };
    console.error = () => {};
    console.warn = () => {};
    try {
      const respond = () => {
        let out = null;
        const res = { status() { return this; }, json(p) { out = p; return this; } };
        errorHandler(new Error('SELECT * FROM users failed at /srv/app/secret.js'), { method: 'GET', originalUrl: '/x', headers: {} }, res, () => {});
        return out;
      };

      delete process.env.NODE_ENV;
      let payload = respond();
      assert.ok(!('stack' in payload), 'unset NODE_ENV must not expose stacks');
      assert.ok(!payload.message.includes('secret.js'));

      process.env.NODE_ENV = 'production';
      payload = respond();
      assert.ok(!('stack' in payload));

      process.env.NODE_ENV = 'development';
      payload = respond();
      assert.ok('stack' in payload, 'explicit development keeps stacks for debugging');
    } finally {
      console.error = quiet.log;
      console.warn = quiet.warn;
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  server.close();
  console.log('\n----------------------------------------------------');
  console.log(` INPUT/API SECURITY SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
