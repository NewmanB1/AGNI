'use strict';

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

const HUB_KEY = 'integration-test-hub-key';

function makeRequest(method, baseUrl, urlPath, body, headers) {
  const url = new URL(urlPath, baseUrl);
  const bodyStr = body ? JSON.stringify(body) : '';
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: Object.assign({ Accept: 'application/json', 'x-hub-key': HUB_KEY }, headers || {})
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : {} }); }
        catch (e) { reject(new Error(`${urlPath} parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error(`${urlPath} timeout`)); });
    if (body) req.write(bodyStr);
    req.end();
  });
}

const get = (base, p, h) => makeRequest('GET', base, p, null, h);
const put = (base, p, b, h) => makeRequest('PUT', base, p, b, h);

describe('Feature flags integration', () => {
  let server, baseUrl, adminToken;

  before(async () => {
    process.env.AGNI_HUB_API_KEY = HUB_KEY;
    const theta = require('@agni/hub').theta;
    const accountsService = require('@agni/hub').accounts;
    const reg = await accountsService.registerCreator({
      name: 'Test Admin', email: 'admin@test.local', password: 'testpass123'
    });
    if (reg.creator) {
      await accountsService.setCreatorApproval(reg.creator.id, true);
      await accountsService.setCreatorRole(reg.creator.id, 'admin');
    }
    const login = await accountsService.loginCreator({ email: 'admin@test.local', password: 'testpass123' });
    adminToken = login.token;
    try { await theta.rebuildLessonIndex(); } catch { /* ok */ }
    server = theta.startApi(0);
    const port = await new Promise((r) => server.once('listening', () => r(server.address().port)));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
  });

  function authHeaders() {
    return { Authorization: `Bearer ${adminToken}` };
  }

  it('GET /api/flags returns empty flags initially', async () => {
    const { statusCode, data } = await get(baseUrl, '/api/flags', authHeaders());
    assert.equal(statusCode, 200);
    assert.ok(data.flags !== undefined);
    assert.deepEqual(data.flags, {});
  });

  it('PUT /api/flags/:name rejects without auth', async () => {
    const { statusCode } = await put(baseUrl, '/api/flags/dark_mode', { enabled: true, rollout: 50 });
    assert.equal(statusCode, 401);
  });

  it('PUT /api/flags/:name creates a new flag with admin auth', async () => {
    const { statusCode, data } = await put(baseUrl, '/api/flags/dark_mode', {
      enabled: true, rollout: 50, description: 'Dark mode experiment', metric: 'mastery'
    }, authHeaders());
    assert.equal(statusCode, 200);
    assert.equal(data.ok, true);
    assert.equal(data.flag.enabled, true);
    assert.equal(data.flag.rollout, 50);
    assert.equal(data.flag.metric, 'mastery');
  });

  it('GET /api/flags lists the created flag', async () => {
    const { statusCode, data } = await get(baseUrl, '/api/flags', authHeaders());
    assert.equal(statusCode, 200);
    assert.ok(data.flags.dark_mode);
    assert.equal(data.flags.dark_mode.enabled, true);
    assert.equal(data.flags.dark_mode.rollout, 50);
  });

  it('PUT /api/flags/:name updates an existing flag', async () => {
    const { statusCode, data } = await put(baseUrl, '/api/flags/dark_mode', {
      enabled: true, rollout: 100, description: 'Dark mode full rollout'
    }, authHeaders());
    assert.equal(statusCode, 200);
    assert.equal(data.flag.rollout, 100);
  });

  it('PUT /api/flags/:name clamps rollout to [0,100]', async () => {
    const { data: over } = await put(baseUrl, '/api/flags/clamp_test', { enabled: true, rollout: 200 }, authHeaders());
    assert.equal(over.flag.rollout, 100);
    const { data: under } = await put(baseUrl, '/api/flags/clamp_neg', { enabled: true, rollout: -10 }, authHeaders());
    assert.equal(under.flag.rollout, 0);
  });

  it('GET /api/flags/:name/results returns A/B metrics', async () => {
    const { statusCode, data } = await get(baseUrl, '/api/flags/dark_mode/results', authHeaders());
    assert.equal(statusCode, 200);
    assert.equal(data.flag, 'dark_mode');
    assert.equal(data.metric, 'mastery');
    assert.ok(typeof data.treatment === 'object');
    assert.ok(typeof data.control === 'object');
    assert.ok(typeof data.treatment.count === 'number');
    assert.ok(typeof data.treatment.avg === 'number');
    assert.ok(typeof data.control.count === 'number');
    assert.ok(typeof data.control.avg === 'number');
  });

  it('GET /api/flags/:name/results returns 404 for unknown flag', async () => {
    const { statusCode } = await get(baseUrl, '/api/flags/nonexistent/results', authHeaders());
    assert.equal(statusCode, 404);
  });

  it('isEnabled is deterministic for the same student', () => {
    const { isEnabled } = require('@agni/utils/feature-flags');
    const flag = { enabled: true, rollout: 50 };
    const result1 = isEnabled(flag, 'student_alpha');
    const result2 = isEnabled(flag, 'student_alpha');
    assert.equal(result1, result2, 'Same student should get same result');
  });

  it('isEnabled produces different results for different students at partial rollout', () => {
    const { isEnabled } = require('@agni/utils/feature-flags');
    const flag = { enabled: true, rollout: 50 };
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      results.add(isEnabled(flag, `student_${i}`));
    }
    assert.equal(results.size, 2, 'At 50% rollout, expect both true and false across 100 students');
  });

  it('isEnabled returns false when flag is disabled', () => {
    const { isEnabled } = require('@agni/utils/feature-flags');
    assert.equal(isEnabled({ enabled: false, rollout: 100 }, 'any_student'), false);
  });

  it('isEnabled returns true at 100% rollout for any student', () => {
    const { isEnabled } = require('@agni/utils/feature-flags');
    const flag = { enabled: true, rollout: 100 };
    for (let i = 0; i < 20; i++) {
      assert.equal(isEnabled(flag, `student_${i}`), true);
    }
  });

  it('getActiveFlagsForStudent returns correct map', async () => {
    const { getActiveFlagsForStudent } = require('@agni/utils/feature-flags');
    const active = await getActiveFlagsForStudent('student_0');
    assert.ok(typeof active === 'object');
    assert.ok('dark_mode' in active, 'dark_mode should appear in active flags');
    assert.ok(typeof active.dark_mode === 'boolean');
  });
});
