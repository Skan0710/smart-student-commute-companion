/**
 * Community Authorization & Privilege-Escalation Regression Tests
 *
 * Proves the server (not the UI) enforces who may change shared data:
 * - Self-registration can never mint an admin, and profile updates cannot
 *   write role / password_hash (mass assignment).
 * - Ride groups and live reports are owned by the authenticated account that
 *   created them; copying someone's display name grants nothing.
 * - Anonymous callers cannot edit/delete, and anonymous/legacy rows are
 *   admin-only.
 * - Feedback listing/editing and the destructive demo reset are admin-only.
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const config = require('../config');
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

function makeRequester(server) {
  const { port } = server.address();
  return (method, path, { body, token } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
          }
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(data);
            } catch {
              json = data;
            }
            resolve({ status: res.statusCode, body: json });
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
  console.log(' Community Authorization Regression Test Suite');
  console.log('====================================================\n');

  const server = http.createServer(createApp()).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const call = makeRequester(server);

  const stamp = Date.now();
  const password = 'StrongPass123';

  async function registerAndLogin(label, extra = {}) {
    const email = `${label}_${stamp}@authz.test`;
    const reg = await call('POST', '/api/auth/register', {
      body: { email, password, full_name: `Student ${label}`, college_name: 'DJ Sanghvi', ...extra }
    });
    assert.strictEqual(reg.status, 201, `register ${label}: ${JSON.stringify(reg.body)}`);
    const login = await call('POST', '/api/auth/login', { body: { email, password } });
    assert.strictEqual(login.status, 200);
    return { id: reg.body.user.id, email, token: login.body.token, user: reg.body.user, login: login.body };
  }

  // Admin accounts are provisioned server-side only (never via the API).
  const adminEmail = `admin_${stamp}@authz.test`;
  userRepository.create({
    email: adminEmail,
    password,
    full_name: 'Authz Admin',
    college_name: 'Ops',
    role: 'admin'
  });
  const adminLogin = await call('POST', '/api/auth/login', { body: { email: adminEmail, password } });
  const adminToken = adminLogin.body.token;

  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');

  // ---- Privilege escalation -------------------------------------------
  await test('Registration ignores a client-supplied admin role', async () => {
    const mallory = await registerAndLogin('mallory', { role: 'admin' });
    assert.strictEqual(mallory.user.role, 'student');
    assert.strictEqual(mallory.login.user.role, 'student');
    const users = await call('GET', '/api/auth/users', { token: mallory.token });
    assert.strictEqual(users.status, 403, 'self-registered account must not list users');
  });

  await test('Profile update cannot write role or password_hash (mass assignment)', async () => {
    const res = await call('PATCH', `/api/auth/users/${alice.id}`, {
      token: alice.token,
      body: { full_name: 'Alice Renamed', role: 'admin', password_hash: 'x:x', email: 'evil@authz.test' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.full_name, 'Alice Renamed');
    assert.strictEqual(res.body.user.role, 'student');
    assert.strictEqual(res.body.user.email, alice.email);
    const relogin = await call('POST', '/api/auth/login', { body: { email: alice.email, password } });
    assert.strictEqual(relogin.status, 200, 'password must be untouched');
    assert.strictEqual(relogin.body.user.role, 'student');
  });

  await test('Profile update containing only protected fields is rejected', async () => {
    const res = await call('PATCH', `/api/auth/users/${alice.id}`, {
      token: alice.token,
      body: { role: 'admin' }
    });
    assert.strictEqual(res.status, 400);
  });

  await test("A user cannot edit another user's profile", async () => {
    const res = await call('PATCH', `/api/auth/users/${alice.id}`, {
      token: bob.token,
      body: { full_name: 'Hijacked' }
    });
    assert.strictEqual(res.status, 403);
  });

  // ---- Ride groups ----------------------------------------------------
  const groupBody = name => ({
    creator_pseudonym: name,
    origin_area: 'Andheri',
    destination_college: 'DJ Sanghvi College',
    departure_time: '08:00',
    mode: 'train',
    max_members: 4,
    notes: 'authz test'
  });

  let aliceGroupId;
  let anonGroupId;

  await test('Signed-in creation records ownership without leaking it', async () => {
    const res = await call('POST', '/api/ride-groups', { token: alice.token, body: groupBody('AliceCommuter') });
    assert.strictEqual(res.status, 201);
    aliceGroupId = res.body.group.id;
    assert.ok(!('creator_user_id' in res.body.group), 'owner id must not be serialized');
    const anon = await call('POST', '/api/ride-groups', { body: groupBody('AnonCommuter') });
    assert.strictEqual(anon.status, 201);
    anonGroupId = anon.body.group.id;
  });

  await test('Anonymous callers cannot edit or delete ride groups', async () => {
    const patch = await call('PATCH', `/api/ride-groups/${aliceGroupId}`, { body: { notes: 'pwned' } });
    assert.strictEqual(patch.status, 401);
    const del = await call('DELETE', `/api/ride-groups/${aliceGroupId}`);
    assert.strictEqual(del.status, 401);
  });

  await test('Another student cannot edit or delete a ride group they do not own', async () => {
    const patch = await call('PATCH', `/api/ride-groups/${aliceGroupId}`, { token: bob.token, body: { notes: 'pwned' } });
    assert.strictEqual(patch.status, 403);
    const del = await call('DELETE', `/api/ride-groups/${aliceGroupId}`, { token: bob.token });
    assert.strictEqual(del.status, 403);
  });

  await test('Copying a creator display name does not grant ownership', async () => {
    const impostor = await registerAndLogin('impostor');
    await call('PATCH', `/api/auth/users/${impostor.id}`, {
      token: impostor.token,
      body: { full_name: 'AliceCommuter' }
    });
    const relogin = await call('POST', '/api/auth/login', { body: { email: impostor.email, password } });
    const res = await call('DELETE', `/api/ride-groups/${aliceGroupId}`, { token: relogin.body.token });
    assert.strictEqual(res.status, 403);
  });

  await test('Anonymous/legacy ride groups are not editable by students', async () => {
    const res = await call('PATCH', `/api/ride-groups/${anonGroupId}`, { token: alice.token, body: { notes: 'x' } });
    assert.strictEqual(res.status, 403);
  });

  await test('Owner can edit; admin can delete any group', async () => {
    const ok = await call('PATCH', `/api/ride-groups/${aliceGroupId}`, { token: alice.token, body: { notes: 'updated' } });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body.group.notes, 'updated');
    const adminDel = await call('DELETE', `/api/ride-groups/${anonGroupId}`, { token: adminToken });
    assert.strictEqual(adminDel.status, 200);
    const ownerDel = await call('DELETE', `/api/ride-groups/${aliceGroupId}`, { token: alice.token });
    assert.strictEqual(ownerDel.status, 200);
  });

  // ---- Live reports ---------------------------------------------------
  const reportBody = pseudonym => ({
    pseudonym,
    area: 'Dadar',
    route_name: 'Western Line',
    mode: 'train',
    message: 'Signal failure near Dadar',
    impact: 'medium'
  });

  let aliceReportId;
  let anonReportId;

  await test('Reports: signed-in and anonymous creation both work; owner is not serialized', async () => {
    const res = await call('POST', '/api/live-reports', { token: alice.token, body: reportBody('AliceReporter') });
    assert.strictEqual(res.status, 201);
    aliceReportId = res.body.report.id;
    assert.ok(!('creator_user_id' in res.body.report));
    const anon = await call('POST', '/api/live-reports', { body: reportBody('AnonReporter') });
    assert.strictEqual(anon.status, 201);
    anonReportId = anon.body.report.id;
  });

  await test('Reports: anonymous callers cannot edit or delete', async () => {
    const patch = await call('PATCH', `/api/live-reports/${aliceReportId}`, { body: { message: 'tampered report' } });
    assert.strictEqual(patch.status, 401);
    const del = await call('DELETE', `/api/live-reports/${aliceReportId}`);
    assert.strictEqual(del.status, 401);
  });

  await test("Reports: another student cannot edit/delete someone else's report", async () => {
    const patch = await call('PATCH', `/api/live-reports/${aliceReportId}`, { token: bob.token, body: { message: 'tampered report' } });
    assert.strictEqual(patch.status, 403);
    const del = await call('DELETE', `/api/live-reports/${aliceReportId}`, { token: bob.token });
    assert.strictEqual(del.status, 403);
    const anonOwned = await call('PATCH', `/api/live-reports/${anonReportId}`, { token: alice.token, body: { message: 'claim it' } });
    assert.strictEqual(anonOwned.status, 403, 'anonymous reports are admin-only');
  });

  await test('Reports: owner and admin can modify; anonymous voting still works', async () => {
    const vote = await call('POST', `/api/live-reports/${aliceReportId}/confirm`, { body: {} });
    assert.strictEqual(vote.status, 200);
    const ok = await call('PATCH', `/api/live-reports/${aliceReportId}`, { token: alice.token, body: { message: 'Updated by owner' } });
    assert.strictEqual(ok.status, 200);
    const adminDel = await call('DELETE', `/api/live-reports/${anonReportId}`, { token: adminToken });
    assert.strictEqual(adminDel.status, 200);
    const ownerDel = await call('DELETE', `/api/live-reports/${aliceReportId}`, { token: alice.token });
    assert.strictEqual(ownerDel.status, 200);
  });

  // ---- Feedback -------------------------------------------------------
  let feedbackId;
  await test('Feedback: anyone can submit; only admins can list, edit or delete', async () => {
    const submit = await call('POST', '/api/feedback', {
      body: { recommendation_id: `authz-${stamp}`, is_useful: true, tags: [], comment: 'good route' }
    });
    assert.strictEqual(submit.status, 201);

    assert.strictEqual((await call('GET', '/api/feedback')).status, 401);
    assert.strictEqual((await call('GET', '/api/feedback', { token: alice.token })).status, 403);

    const list = await call('GET', `/api/feedback?recommendation_id=authz-${stamp}`, { token: adminToken });
    assert.strictEqual(list.status, 200);
    feedbackId = list.body.feedback[0].id;

    assert.strictEqual((await call('PATCH', `/api/feedback/${feedbackId}`, { body: { comment: 'x' } })).status, 401);
    assert.strictEqual((await call('DELETE', `/api/feedback/${feedbackId}`, { token: alice.token })).status, 403);
    assert.strictEqual((await call('DELETE', `/api/feedback/${feedbackId}`, { token: adminToken })).status, 200);
  });

  // ---- Demo reset -----------------------------------------------------
  await test('Demo reset: anonymous 401, student 403, admin 200, disabled flag 404', async () => {
    assert.strictEqual((await call('POST', '/api/demo/reset')).status, 401);
    assert.strictEqual((await call('POST', '/api/demo/reset', { token: alice.token })).status, 403);

    const previous = config.allowDemoReset;
    config.allowDemoReset = true;
    assert.strictEqual((await call('POST', '/api/demo/reset', { token: adminToken })).status, 200);
    config.allowDemoReset = false;
    assert.strictEqual((await call('POST', '/api/demo/reset', { token: adminToken })).status, 404);
    config.allowDemoReset = previous;
  });

  server.close();
  console.log('\n----------------------------------------------------');
  console.log(` COMMUNITY AUTHORIZATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
