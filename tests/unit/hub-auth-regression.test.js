'use strict';

/**
 * Regression tests for hub route auth.
 * Proves that protected routes reject unauthenticated requests.
 * Run: npm run test:unit (includes this file)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

var HUB_KEY = 'hub-auth-regression-test-key';

function request(port, method, urlPath, body, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (opts.hubKey) headers['x-hub-key'] = opts.hubKey;
    if (opts.bearer) headers['Authorization'] = 'Bearer ' + opts.bearer;
    const reqOpts = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers
    };
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Hub auth regression', () => {
  let server;
  let port;
  let dataDir;

  before(async () => {
    dataDir = path.join(os.tmpdir(), 'agni-hub-auth-test-' + Date.now());
    fs.mkdirSync(path.join(dataDir, 'yaml'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'serve'), { recursive: true });
    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = path.join(dataDir, 'serve');
    process.env.AGNI_YAML_DIR = path.join(dataDir, 'yaml');
    process.env.AGNI_HUB_API_KEY = HUB_KEY;

    fs.writeFileSync(path.join(dataDir, 'mastery-summary.json'), JSON.stringify({ students: {} }));
    fs.writeFileSync(path.join(dataDir, 'lesson-index.json'), JSON.stringify([]));
    fs.writeFileSync(path.join(dataDir, 'approved-catalog.json'), JSON.stringify({ lessonIds: [] }));
    fs.writeFileSync(path.join(dataDir, 'groups.json'), JSON.stringify({ groups: [] }));
    fs.writeFileSync(path.join(dataDir, 'recommendation-overrides.json'), JSON.stringify({}));

    const theta = require('../../hub-tools/theta');
    server = theta.startApi(0);
    await new Promise(resolve => setTimeout(resolve, 150));
    port = server.address().port;
  });

  after(() => {
    if (server) server.close();
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
    delete process.env.AGNI_DATA_DIR;
    delete process.env.AGNI_SERVE_DIR;
    delete process.env.AGNI_YAML_DIR;
    delete process.env.AGNI_HUB_API_KEY;
  });

  it('GET /api/chain/:slug returns 401 without hub key', async () => {
    const res = await request(port, 'GET', '/api/chain/test-slug', null, {});
    assert.equal(res.status, 401, 'expected 401 without X-Hub-Key');
    assert.ok(res.body.error);
  });

  it('POST /api/chain/verify returns 401 without hub key', async () => {
    const res = await request(port, 'POST', '/api/chain/verify', { slug: 'test' }, {});
    assert.equal(res.status, 401, 'expected 401 without X-Hub-Key');
    assert.ok(res.body.error);
  });

  it('GET /api/fork-check returns 401 without hub key', async () => {
    const res = await request(port, 'GET', '/api/fork-check?slug=test', null, {});
    assert.equal(res.status, 401, 'expected 401 without X-Hub-Key');
    assert.ok(res.body.error);
  });

  it('GET /api/chain/:slug returns 200 with hub key', async () => {
    const res = await request(port, 'GET', '/api/chain/nonexistent', null, { hubKey: HUB_KEY });
    assert.ok(res.status === 200 || res.status === 404, 'expected 200 or 404 with valid key');
  });
});
