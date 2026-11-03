/**
 * Database & record-access security tests
 *
 * - Every SQL statement binds values; only whitelisted, code-owned fragments are interpolated.
 * - Supabase RLS: every table is deny-by-default, anon has no privileges, owned tables
 *   are restricted to user_id = caller, password_hash is unreachable from clients.
 * - AES-256-GCM field encryption: round trip, tamper/move/wrong-key detection, lazy upgrade,
 *   and ciphertext really is what lands in the database.
 * - Record access: a student cannot read or change another student's profile, schedules,
 *   saved commutes or courses, and cannot tamper with immutable fields.
 */

// Isolate from the development database: this suite creates users and records.
const os = require('os');
const path = require('path');
const fs = require('fs');
const isolatedDbPath = path.join(os.tmpdir(), `sscc-db-access-${process.pid}.db`);
for (const suffix of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(isolatedDbPath + suffix); } catch { /* not present */ }
}
process.env.DATABASE_PATH = isolatedDbPath;
process.on('exit', () => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(isolatedDbPath + suffix); } catch { /* already gone */ }
  }
});

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const config = require('../config');
const { validateEnv } = config;
const { encryptField, decryptField, isEncrypted, parseKey } = require('../utils/fieldCrypto');
const { studentProfileRepository } = require('../repositories/StudentProfileRepository');
const { userRepository } = require('../repositories');
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

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'scripts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Code-owned fragments that may be interpolated into SQL. Values (user input) are
// never in this list: they must be bound with ? / @name / $n.
const SAFE_SQL_FRAGMENT = [
  /^(whereClause|where|orderBy|orderClause|sortOrder|sortField|clause|fullClause|placeholders)$/,
  /^(conditions|setClauses|fieldsToSet|sets|assignments|tokenClauses)\.join\(['"][^'"]*['"]\)$/,
  /^(key|dbKey|field|tableName|columnName|table|column|pragmaStr)$/,
  /^key\} = \?$/,
  /^buildFieldClause\(fields\)$/
];

// Reviewed exceptions: the match is prose in a log/explanation string, or a code-built
// list of '?' placeholders / a code constant. Keyed by file so new uses still fail.
const REVIEWED = {
  'db/connection.js': ['targetPath'], // log message, not a statement
  'db/database.js': ['columnDef'], // column definition constant passed by bootstrap code
  'services/departureAdviceService.js': ['firstMorningArrTime', 'firstDeparture'], // explanation prose
  'services/gtfsService.js': ['oPlaceholders', 'dPlaceholders'], // '?,?,?' lists built from array length
  'services/studyPlanningService.js': ['heavyDates.size', "Array.from(heavyDates).join(', ')"] // explanation prose
};

const startApp = () => new Promise(resolve => {
  const server = http.createServer(createApp()).listen(0, '127.0.0.1', () => resolve(server));
});

function caller(server) {
  const { port } = server.address();
  return (method, p, { body, token } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1', port, method, path: p,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        },
        res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => {
            let parsed = null;
            try { parsed = data ? JSON.parse(data) : null; } catch { /* non-JSON */ }
            resolve({ status: res.statusCode, body: parsed });
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
  console.log(' Database & Record Access Security Test Suite');
  console.log('====================================================\n');

  // ---- 1. Parameterised queries -------------------------------------------
  await test('SQL statements only interpolate whitelisted code-owned fragments (values are always bound)', () => {
    const root = path.resolve(__dirname, '..');
    const offenders = [];
    for (const file of listJsFiles(root)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const literal of src.matchAll(/`([^`]*)`/g)) {
        const text = literal[1];
        if (!/\b(SELECT\s|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|WHERE\s|ORDER\s+BY|ALTER\s+TABLE|PRAGMA\s)/i.test(text)) continue;
        for (const expr of text.matchAll(/\$\{([^}]+)\}/g)) {
          const e = expr[1].trim();
          const rel = path.relative(root, file).split(path.sep).join('/');
          if ((REVIEWED[rel] || []).includes(e)) continue;
          if (!SAFE_SQL_FRAGMENT.some(rx => rx.test(e))) {
            offenders.push(`${path.relative(root, file)}: \${${e}}`);
          }
        }
      }
    }
    assert.deepStrictEqual(offenders, [], 'Unreviewed SQL interpolation:\n  ' + offenders.join('\n  '));
  });

  await test('Interpolated column/sort fragments come from fixed allow-lists, not request data', () => {
    // Representative guard: update helpers iterate an allow-list, never Object.keys(request body).
    const repoDir = path.resolve(__dirname, '..', 'repositories');
    for (const f of fs.readdirSync(repoDir)) {
      const src = fs.readFileSync(path.join(repoDir, f), 'utf8');
      assert.ok(!/for\s*\(\s*const\s+\w+\s+of\s+Object\.keys\(\s*(updates|data|body|payload)\s*\)\s*\)[\s\S]{0,120}\$\{/.test(src),
        `${f} builds SET clauses from raw request keys`);
    }
  });

  // ---- 2. Supabase Row Level Security --------------------------------------
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'db', 'supabase_schema.sql'), 'utf8');
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map(m => m[1]);

  await test('RLS is enabled on every table and anon has no privileges', () => {
    assert.ok(tables.length >= 15);
    for (const t of tables) {
      assert.ok(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(sql), `${t}: RLS not enabled`);
      assert.ok(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon`).test(sql), `${t}: anon not revoked`);
      assert.ok(!new RegExp(`TO[^;]*\\banon\\b[^;]*USING`, 'i').test(sql), 'a policy grants access to anon');
    }
  });

  await test('Owned tables allow SELECT/INSERT/UPDATE/DELETE only where user_id is the caller', () => {
    const owned = ['student_profiles', 'courses', 'assignments', 'calendar_events', 'study_sessions',
      'study_resources', 'study_plans', 'study_plan_items', 'goals', 'saved_routes', 'notifications'];
    const me = '\\(SELECT public\\.current_app_user_id\\(\\)\\)';
    for (const t of owned) {
      assert.ok(tables.includes(t), `${t} missing from schema`);
      for (const [op, clause] of [
        ['SELECT', `USING \\(user_id = ${me}\\)`],
        ['INSERT', `WITH CHECK \\(user_id = ${me}\\)`],
        ['UPDATE', `USING \\(user_id = ${me}\\)\\s+WITH CHECK \\(user_id = ${me}\\)`],
        ['DELETE', `USING \\(user_id = ${me}\\)`]
      ]) {
        const rx = new RegExp(`CREATE POLICY ${t}_${op.toLowerCase()}_own ON public\\.${t} FOR ${op} TO authenticated\\s+${clause}`);
        assert.ok(rx.test(sql), `${t}: missing/incorrect ${op} ownership policy`);
      }
    }
  });

  await test('users: password_hash/role/email are unreachable or immutable for clients; identity is not client-editable', () => {
    const grantSelect = sql.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.users TO authenticated/);
    assert.ok(grantSelect, 'column-level SELECT grant missing');
    assert.ok(!/password_hash/.test(grantSelect[1]), 'password_hash must not be selectable');
    const grantUpdate = sql.match(/GRANT UPDATE \(([^)]*)\)\s+ON public\.users TO authenticated/);
    assert.ok(grantUpdate, 'column-level UPDATE grant missing');
    assert.deepStrictEqual(grantUpdate[1].split(',').map(s => s.trim()).sort(), ['college_name', 'full_name', 'profile_picture']);
    assert.ok(!/ON public\.users FOR (INSERT|DELETE)/.test(sql), 'clients must not insert/delete accounts');
    assert.ok(!/user_metadata/.test(sql.replace(/--.*$/gm, '')), 'policies must not trust client-editable user_metadata');
    assert.ok(/app_metadata/.test(sql));
  });

  await test('Community tables: creator-only writes; confirmations/feedback are append-only', () => {
    assert.ok(/CREATE POLICY reports_update_own ON public\.live_commute_reports FOR UPDATE TO authenticated\s+USING \(user_id = /.test(sql));
    assert.ok(/CREATE POLICY ride_groups_delete_own ON public\.ride_groups FOR DELETE TO authenticated\s+USING \(created_by = /.test(sql));
    assert.ok(/GRANT SELECT, INSERT, DELETE ON public\.live_report_confirmations TO authenticated/.test(sql));
    assert.ok(/GRANT SELECT, INSERT ON public\.feedback TO authenticated/.test(sql));
  });

  // ---- 3. Field encryption (AES-256-GCM) -----------------------------------
  const KEY = 'a1'.repeat(32);
  const OTHER_KEY = 'b2'.repeat(32);

  await test('AES-256-GCM round-trips and uses a fresh IV for every value', () => {
    const a = encryptField('Andheri West', 'ctx:1', KEY);
    const b = encryptField('Andheri West', 'ctx:1', KEY);
    assert.ok(isEncrypted(a) && a.startsWith('enc:v1:'));
    assert.notStrictEqual(a, b, 'IV must not repeat');
    assert.ok(!a.includes('Andheri'));
    assert.strictEqual(decryptField(a, 'ctx:1', KEY), 'Andheri West');
    assert.strictEqual(decryptField(b, 'ctx:1', KEY), 'Andheri West');
    // unicode
    assert.strictEqual(decryptField(encryptField('अंधेरी 🚆', 'c', KEY), 'c', KEY), 'अंधेरी 🚆');
  });

  await test('Tampered, moved or wrong-key ciphertext is rejected; legacy plaintext and empties pass through', () => {
    const enc = encryptField('secret', 'student_profiles.home_area:u1', KEY);
    assert.throws(() => decryptField(enc, 'student_profiles.home_area:u2', KEY), /failed authentication/);
    assert.throws(() => decryptField(enc, 'student_profiles.home_area:u1', OTHER_KEY), /failed authentication/);
    const parts = enc.split(':');
    const ct = Buffer.from(parts[4], 'base64url');
    ct[0] ^= 1;
    parts[4] = ct.toString('base64url');
    assert.throws(() => decryptField(parts.join(':'), 'student_profiles.home_area:u1', KEY), /failed authentication/);
    assert.throws(() => decryptField('enc:v1:bad', 'x', KEY), /Malformed/);
    assert.strictEqual(decryptField('plain legacy value', 'x', KEY), 'plain legacy value');
    assert.strictEqual(encryptField('', 'x', KEY), '');
    assert.strictEqual(encryptField(enc, 'x', KEY), enc, 'already-encrypted values are not double-encrypted');
  });

  await test('Key format is validated; production requires FIELD_ENCRYPTION_KEY', () => {
    assert.strictEqual(parseKey(KEY).length, 32);
    assert.strictEqual(parseKey(Buffer.alloc(32, 7).toString('base64')).length, 32);
    assert.throws(() => parseKey('too-short'), /32 random bytes/);
    const base = { NODE_ENV: 'production', CLIENT_URL: 'https://app.example.org', JWT_SECRET: 'x'.repeat(40) };
    assert.throws(() => validateEnv({ ...base }), /FIELD_ENCRYPTION_KEY is required in production/);
    assert.throws(() => validateEnv({ ...base, FIELD_ENCRYPTION_KEY: 'nope' }), /32 random bytes/);
    assert.doesNotThrow(() => validateEnv({ ...base, FIELD_ENCRYPTION_KEY: KEY }));
    assert.doesNotThrow(() => validateEnv({ NODE_ENV: 'development' }));
  });

  await test('Student home area is stored as ciphertext and read back as plaintext; legacy rows upgrade on read', () => {
    const previousKey = config.fieldEncryptionKey;
    config.fieldEncryptionKey = KEY;
    try {
      const user = userRepository.create({
        email: `enc.${Date.now()}@example.com`, password: 'EncryptMe123', full_name: 'Enc User', college_name: 'DJSCE'
      });
      studentProfileRepository.upsert(user.id, { home_area: 'Andheri West', default_college: 'DJSCE' });
      const db = getConnection();
      const raw = () => db.prepare('SELECT home_area FROM student_profiles WHERE user_id = ?').get(user.id).home_area;

      assert.ok(isEncrypted(raw()) && !raw().includes('Andheri'), 'database must hold ciphertext');
      assert.strictEqual(studentProfileRepository.findByUserId(user.id).home_area, 'Andheri West');

      // an unrelated update keeps the value intact and encrypted
      studentProfileRepository.upsert(user.id, { default_college: 'VJTI' });
      assert.ok(isEncrypted(raw()));
      assert.strictEqual(studentProfileRepository.findByUserId(user.id).home_area, 'Andheri West');

      // legacy plaintext row
      db.prepare('UPDATE student_profiles SET home_area = ? WHERE user_id = ?').run('Bandra', user.id);
      assert.strictEqual(studentProfileRepository.findByUserId(user.id).home_area, 'Bandra');
      assert.ok(isEncrypted(raw()), 'legacy plaintext is upgraded on read');

      // a value copied to another student's row must not decrypt there
      const other = userRepository.create({
        email: `enc2.${Date.now()}@example.com`, password: 'EncryptMe123', full_name: 'Other User', college_name: 'DJSCE'
      });
      studentProfileRepository.upsert(other.id, { home_area: 'Dadar' });
      db.prepare('UPDATE student_profiles SET home_area = ? WHERE user_id = ?').run(raw(), other.id);
      assert.throws(() => studentProfileRepository.findByUserId(other.id), /failed authentication/);
    } finally {
      config.fieldEncryptionKey = previousKey;
    }
  });

  // ---- 4. Record access control & field tampering ---------------------------
  const server = await startApp();
  const call = caller(server);
  const stamp = Date.now();
  const password = 'StrongPass123';

  async function signUp(label) {
    const email = `${label}.${stamp}@access.test`;
    const reg = await call('POST', '/api/auth/register', {
      body: { email, password, full_name: `${label} Student`, college_name: 'DJSCE' }
    });
    assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
    const login = await call('POST', '/api/auth/login', { body: { email, password } });
    assert.strictEqual(login.status, 200);
    return { id: login.body.user.id, token: login.body.token, email };
  }

  const alice = await signUp('alice');
  const bob = await signUp('bob');

  try {
    await test('Registration cannot self-assign a role', async () => {
      const email = `mallory.${stamp}@access.test`;
      const reg = await call('POST', '/api/auth/register', {
        body: { email, password, full_name: 'Mallory', college_name: 'DJSCE', role: 'admin', id: 'usr-forced' }
      });
      assert.ok([201, 400].includes(reg.status));
      const stored = userRepository.findByEmail(email);
      if (stored) {
        assert.strictEqual(stored.role, 'student');
        assert.notStrictEqual(stored.id, 'usr-forced');
      }
    });

    await test('Profile PATCH ignores immutable fields (id, email, role, password_hash, created_at)', async () => {
      const res = await call('PATCH', `/api/auth/users/${alice.id}`, {
        token: alice.token,
        body: {
          full_name: 'Alice Renamed', role: 'admin', email: 'evil@example.com', id: 'usr-hijack',
          password_hash: 'x', created_at: 1
        }
      });
      assert.ok([200, 400].includes(res.status), `unexpected ${res.status}`);
      const me = await call('GET', '/api/auth/me', { token: alice.token });
      assert.strictEqual(me.body.user.role, 'student');
      assert.strictEqual(me.body.user.email, alice.email);
      assert.strictEqual(me.body.user.id, alice.id);
      const row = userRepository.findById(alice.id);
      assert.notStrictEqual(row.password_hash, 'x');
      assert.notStrictEqual(row.created_at, 1);
      // and the original credentials still work
      const again = await call('POST', '/api/auth/login', { body: { email: alice.email, password } });
      assert.strictEqual(again.status, 200);
    });

    await test('A student cannot read or alter another student\'s account (403)', async () => {
      const read = await call('GET', `/api/auth/users/${alice.id}`, { token: bob.token });
      assert.strictEqual(read.status, 403);
      const write = await call('PATCH', `/api/auth/users/${alice.id}`, { token: bob.token, body: { full_name: 'Pwned Name' } });
      assert.strictEqual(write.status, 403);
      const me = await call('GET', '/api/auth/me', { token: alice.token });
      assert.notStrictEqual(me.body.user.full_name, 'Pwned Name');
      const anon = await call('GET', `/api/auth/users/${alice.id}`);
      assert.strictEqual(anon.status, 401);
    });

    await test('Profile PUT is bound to the caller; a body user_id cannot redirect the write', async () => {
      const res = await call('PUT', '/api/student/profile', {
        token: bob.token, body: { user_id: alice.id, default_college: 'Bob College', home_area: 'Powai' }
      });
      assert.ok([200, 400].includes(res.status), `unexpected ${res.status}`);
      const aliceProfile = studentProfileRepository.findByUserId(alice.id);
      assert.ok(!aliceProfile || aliceProfile.default_college !== 'Bob College', "Alice's profile was overwritten");
    });

    await test('Schedules: other students get 403/404 and the record is untouched', async () => {
      const created = await call('POST', '/api/student/schedules', {
        token: alice.token,
        body: { title: 'Morning Lecture', origin: 'Andheri', destination: 'Vile Parle', target_arrival_time: '09:00' }
      });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      const id = created.body.schedule?.id || created.body.data?.id || created.body.id;
      assert.ok(id, 'schedule id missing: ' + JSON.stringify(created.body));
      const url = `/api/student/schedules/${id}`;

      for (const [method, body] of [['GET'], ['PUT', { title: 'Hijacked Title' }], ['DELETE']]) {
        const res = await call(method, url, { token: bob.token, body });
        assert.ok([403, 404].includes(res.status), `${method} by another student returned ${res.status}`);
      }
      const intact = await call('GET', url, { token: alice.token });
      assert.strictEqual(intact.status, 200);
      assert.strictEqual((intact.body.schedule || intact.body.data || intact.body).title, 'Morning Lecture');
    });

    await test('Saved commutes: other students get 403/404 and the record is untouched', async () => {
      const created = await call('POST', '/api/student/saved-routes', {
        token: alice.token,
        body: { name: 'Home to College', origin: 'Andheri', destination: 'Vile Parle' }
      });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      const id = created.body.route?.id || created.body.savedRoute?.id || created.body.data?.id || created.body.id;
      assert.ok(id, 'saved route id missing: ' + JSON.stringify(created.body));
      const url = `/api/student/saved-routes/${id}`;

      for (const [method, body] of [['GET'], ['PUT', { name: 'Hijacked Name' }], ['DELETE']]) {
        const res = await call(method, url, { token: bob.token, body });
        assert.ok([403, 404].includes(res.status), `${method} by another student returned ${res.status}`);
      }
      const intact = await call('GET', url, { token: alice.token });
      assert.strictEqual(intact.status, 200);
    });

    await test('Academic courses: other students get 403/404 and cannot list them', async () => {
      const created = await call('POST', '/api/academic/courses', { token: alice.token, body: { name: 'Algorithms' } });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      const id = created.body.course?.id || created.body.data?.id || created.body.id;
      assert.ok(id, 'course id missing: ' + JSON.stringify(created.body));
      const url = `/api/academic/courses/${id}`;

      for (const [method, body] of [['GET'], ['PATCH', { name: 'Hijacked' }], ['DELETE']]) {
        const res = await call(method, url, { token: bob.token, body });
        assert.ok([403, 404].includes(res.status), `${method} by another student returned ${res.status}`);
      }
      const bobList = await call('GET', '/api/academic/courses', { token: bob.token });
      assert.strictEqual(bobList.status, 200);
      assert.ok(!JSON.stringify(bobList.body).includes('Algorithms'), "Bob can see Alice's course");
    });
  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` DB / RECORD ACCESS SECURITY SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
