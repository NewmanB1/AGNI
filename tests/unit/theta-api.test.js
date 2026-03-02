'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

function tempDir() {
  const dir = path.join(os.tmpdir(), 'agni-theta-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

var TEST_HUB_KEY = 'test-hub-key-for-unit-tests';

function request(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'x-hub-key': TEST_HUB_KEY };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Theta API integration tests', () => {
  let server;
  let port;
  let dataDir;

  let adminToken;

  before(async () => {
    dataDir = tempDir();
    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = path.join(dataDir, 'serve');
    process.env.AGNI_HUB_API_KEY = TEST_HUB_KEY;
    fs.mkdirSync(process.env.AGNI_SERVE_DIR, { recursive: true });

    fs.writeFileSync(path.join(dataDir, 'mastery-summary.json'), JSON.stringify({ students: {} }));
    fs.writeFileSync(path.join(dataDir, 'lesson-index.json'), JSON.stringify([]));
    fs.writeFileSync(path.join(dataDir, 'approved-catalog.json'), JSON.stringify({ lessonIds: [] }));

    const { accountsService } = require('../../hub-tools/context/services');
    const result = await accountsService.registerCreator({
      name: 'Test Admin', email: 'admin@test.local', password: 'testpass123'
    });
    if (result.creator) {
      await accountsService.setCreatorApproval(result.creator.id, true);
      await accountsService.setCreatorRole(result.creator.id, 'admin');
    }
    const login = await accountsService.loginCreator({ email: 'admin@test.local', password: 'testpass123' });
    adminToken = login.token;

    const theta = require('../../hub-tools/theta');
    server = theta.startApi(0);
    await new Promise(resolve => setTimeout(resolve, 200));
    port = server.address().port;
  });

  after(() => {
    if (server) server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGNI_DATA_DIR;
    delete process.env.AGNI_SERVE_DIR;
    delete process.env.AGNI_HUB_API_KEY;
    // Clear cached modules that captured env-config at require time
    delete require.cache[require.resolve('../../src/utils/env-config')];
    delete require.cache[require.resolve('../../src/services/accounts')];
    delete require.cache[require.resolve('../../hub-tools/context/auth')];
    delete require.cache[require.resolve('../../hub-tools/context/services')];
  });

  it('GET /api/theta requires pseudoId', async () => {
    const res = await request(port, 'GET', '/api/theta');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('GET /api/theta returns lessons for valid pseudoId', async () => {
    const res = await request(port, 'GET', '/api/theta?pseudoId=test-student');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.lessons));
    assert.equal(res.body.pseudoId, 'test-student');
  });

  it('GET /api/theta/all returns all students', async () => {
    const res = await request(port, 'GET', '/api/theta/all', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.body.students);
  });

  it('GET /api/theta/graph returns graph weights', async () => {
    const res = await request(port, 'GET', '/api/theta/graph');
    assert.equal(res.status, 200);
  });

  it('GET /api/lessons returns lesson index', async () => {
    const res = await request(port, 'GET', '/api/lessons');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.lessons));
  });

  it('returns 405 for unsupported methods', async () => {
    const res = await request(port, 'PATCH', '/api/theta');
    assert.equal(res.status, 405);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(port, 'GET', '/api/nonexistent');
    assert.equal(res.status, 404);
  });

  it('sets security headers on responses', async () => {
    const res = await request(port, 'GET', '/api/theta?pseudoId=test');
    assert.ok(res.headers['x-content-type-options']);
    assert.ok(res.headers['x-request-id']);
  });

  it('GET /api/groups returns groups', async () => {
    const res = await request(port, 'GET', '/api/groups', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.groups));
  });

  it('POST /api/groups creates a group', async () => {
    const res = await request(port, 'POST', '/api/groups', { name: 'Test Group' }, adminToken);
    assert.equal(res.status, 201);
    assert.ok(res.body.ok);
    assert.equal(res.body.group.name, 'Test Group');
  });

  it('GET /api/streaks requires pseudoId', async () => {
    const res = await request(port, 'GET', '/api/streaks');
    assert.equal(res.status, 400);
  });

  it('GET /api/streaks returns streak data', async () => {
    const res = await request(port, 'GET', '/api/streaks?pseudoId=test-student');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.currentStreak, 'number');
    assert.equal(typeof res.body.longestStreak, 'number');
  });

  it('GET /api/badges requires pseudoId', async () => {
    const res = await request(port, 'GET', '/api/badges');
    assert.equal(res.status, 400);
  });

  it('GET /api/badges returns badge data', async () => {
    const res = await request(port, 'GET', '/api/badges?pseudoId=test-student');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.badges));
  });

  it('GET /api/admin/config requires auth', async () => {
    const res = await request(port, 'GET', '/api/admin/config');
    assert.equal(res.status, 401);
  });

  it('GET /api/accounts/creators requires auth', async () => {
    const res = await request(port, 'GET', '/api/accounts/creators');
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/register validates input', async () => {
    const res = await request(port, 'POST', '/api/auth/register', { name: '', email: '', password: '' });
    assert.equal(res.status, 400);
  });

  it('POST /api/auth/register creates account', async () => {
    const uniqueEmail = 'test-' + Date.now() + '@example.com';
    const res = await request(port, 'POST', '/api/auth/register', {
      name: 'Test User',
      email: uniqueEmail,
      password: 'password123'
    });
    assert.equal(res.status, 201, 'Expected 201 but got ' + res.status + ': ' + JSON.stringify(res.body));
    assert.ok(res.body.ok);
  });

  it('POST /api/telemetry accepts events', async () => {
    const res = await request(port, 'POST', '/api/telemetry', {
      events: [{
        pseudoId: 'test-student',
        lessonId: 'lesson-1',
        mastery: 0.8,
        skillsProvided: [{ skill: 'gravity', evidencedLevel: 0.8 }],
        steps: []
      }]
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.accepted));
  });
});
