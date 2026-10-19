/**
 * Test helper: provisions an administrator the same way production does
 * (server-side, never through the public API) and returns a signed token.
 * CRUD-focused suites use it to exercise admin-gated endpoints; denial paths
 * are covered by integration_community_authorization_test.js.
 */

const { userRepository } = require('../../repositories');
const { signToken } = require('../../utils/token');

let cached = null;

function adminAuthHeader() {
  if (!cached) {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const admin = userRepository.create({
      email: `suite_admin_${stamp}@suite.test`,
      password: 'SuiteAdminPass123',
      full_name: 'Suite Admin',
      college_name: 'Test Harness',
      role: 'admin'
    });
    cached = {
      Authorization: `Bearer ${signToken({
        sub: admin.id,
        email: admin.email,
        role: 'admin',
        full_name: admin.full_name
      })}`
    };
  }
  return cached;
}

module.exports = { adminAuthHeader };
