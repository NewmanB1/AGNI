'use strict';

/**
 * Wiring smoke tests — starts a real AGNI server and verifies that every
 * integration seam is reachable over HTTP.
 *
 * These tests exist because past sprints repeatedly created correct files that
 * were never connected to the system: polyfills no loader loaded, routes that
 * returned null because an upstream dependency wasn't wired, version constants
 * that drifted between two builders.
 *
 * Each test makes a real HTTP request. If a route returns 404 or the response
 * body is missing expected content, the wiring is broken regardless of what
 * unit tests or CI gate scripts say about the source code.
 */

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SMOKE_HUB_KEY = 'smoke-wiring-key-' + Date.now();

const MINIMAL_LESSON_YAML = [
  'version: "1.7.0"',
  'meta:',
  '  identifier: smoke-test',
  '  title: Wiring Smoke Test',
  '  language: en',
  '  license: CC-BY-SA-4.0',
  '  created: "2026-01-01T00:00:00Z"',
  'steps:',
  '  - id: s1',
  '    type: instruction',
  '    content: "Hello from the smoke test"'
].join('\n');

const SENSOR_LESSON_YAML = [
  'version: "1.7.0"',
  'meta:',
  '  identifier: sensor-smoke-test',
  '  title: Sensor Wiring Smoke Test',
  '  language: en',
  '  license: CC-BY-SA-4.0',
  '  created: "2026-01-01T00:00:00Z"',
  'steps:',
  '  - id: s1',
  '    type: hardware_trigger',
  '    sensor: accelerometer',
  '    threshold: "accel.total > 2.5g"',
  '    content: "Shake the phone"',
  '  - id: s2',
  '    type: completion',
  '    content: "Done"'
].join('\n');

function httpGet(port, urlPath) {
  return new Promise(function (resolve, reject) {
    const req = http.request({
      hostname: '127.0.0.1', port: port, path: urlPath, method: 'GET',
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        'x-hub-key': SMOKE_HUB_KEY
      }
    }, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function () { req.destroy(); reject(new Error('Timeout: ' + urlPath)); });
    req.end();
  });
}

function httpPost(port, urlPath, body, contentType) {
  return new Promise(function (resolve, reject) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body || {});
    const headers = {
      'Content-Type': contentType || 'application/json',
      'Content-Length': Buffer.byteLength(payload, 'utf8')
    };
    const req = http.request({
      hostname: '127.0.0.1', port: port, path: urlPath, method: 'POST',
      headers: headers
    }, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function () { req.destroy(); reject(new Error('Timeout: ' + urlPath)); });
    req.write(payload, 'utf8');
    req.end();
  });
}

describe('Wiring smoke tests', function () {
  let server, port, dataDir;

  before(async function () {
    dataDir = path.join(os.tmpdir(), 'agni-wiring-smoke-' + Date.now());
    fs.mkdirSync(dataDir, { recursive: true });

    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = path.join(dataDir, 'serve');
    process.env.AGNI_HUB_API_KEY = SMOKE_HUB_KEY;

    // Purge all project modules so env-config picks up the new DATA_DIR
    const rootNorm = path.resolve(__dirname, '../..').replace(/\\/g, '/');
    Object.keys(require.cache).forEach(function (key) {
      const norm = key.replace(/\\/g, '/');
      if (norm.startsWith(rootNorm) && !norm.includes('node_modules')) {
        delete require.cache[key];
      }
    });

    fs.mkdirSync(process.env.AGNI_SERVE_DIR, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'mastery-summary.json'), JSON.stringify({ students: {} }));
    fs.writeFileSync(path.join(dataDir, 'lesson-index.json'), JSON.stringify([]));
    fs.writeFileSync(path.join(dataDir, 'approved-catalog.json'), JSON.stringify({ lessonIds: [] }));

    // Copy data files the compiler needs (archetypes, utu-constants)
    const projectDataDir = path.resolve(__dirname, '../../data');
    ['archetypes.json', 'utu-constants.json'].forEach(function (f) {
      const src = path.join(projectDataDir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dataDir, f));
    });

    // Write minimal YAML lessons so /lessons/smoke-test and /lessons/sensor-smoke-test compile
    const yamlDir = path.join(dataDir, 'yaml');
    fs.mkdirSync(yamlDir, { recursive: true });
    fs.writeFileSync(path.join(yamlDir, 'smoke-test.yaml'), MINIMAL_LESSON_YAML);
    fs.writeFileSync(path.join(yamlDir, 'sensor-smoke-test.yaml'), SENSOR_LESSON_YAML);

    const theta = require('@agni/hub').theta;
    server = theta.startApi(0);
    await new Promise(function (resolve) { setTimeout(resolve, 300); });
    port = server.address().port;
  });

  after(function () {
    if (server) server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGNI_DATA_DIR;
    delete process.env.AGNI_SERVE_DIR;
    delete process.env.AGNI_HUB_API_KEY;

    const rootNorm = path.resolve(__dirname, '../..').replace(/\\/g, '/');
    Object.keys(require.cache).forEach(function (key) {
      const norm = key.replace(/\\/g, '/');
      if (norm.startsWith(rootNorm) && !norm.includes('node_modules')) {
        delete require.cache[key];
      }
    });
  });

  // ── Factory routes (proves hub-transform.attachRoutes succeeded) ───────

  it('GET /factories/shared-runtime.js returns 200 with JS', async function () {
    const res = await httpGet(port, '/factories/shared-runtime.js');
    assert.equal(res.status, 200, 'shared-runtime.js not served — hub-transform.attachRoutes may have failed silently');
    assert.ok(res.headers['content-type'].indexOf('javascript') !== -1);
    assert.ok(res.body.indexOf('AGNI_SHARED') !== -1, 'Response body missing AGNI_SHARED — wrong file served');
  });

  it('GET /factories/polyfills.js returns 200 with polyfill content', async function () {
    const res = await httpGet(port, '/factories/polyfills.js');
    assert.equal(res.status, 200, 'polyfills.js not served — check ALLOWED_FACTORY_FILES');
    assert.ok(res.body.indexOf('String.prototype') !== -1, 'Response body missing String.prototype polyfill');
  });

  it('GET /factories/manifest.json returns 200 with hub-signed manifest (P0 #5)', async function () {
    const res = await httpGet(port, '/factories/manifest.json');
    assert.equal(res.status, 200, '/factories/manifest.json not served');
    var parsed;
    assert.doesNotThrow(function () { parsed = JSON.parse(res.body); }, 'manifest.json is not valid JSON');
    assert.ok(parsed.version, 'manifest missing version');
    assert.ok(Array.isArray(parsed.factories), 'manifest.factories must be array');
    assert.ok(parsed.timestamp, 'manifest missing timestamp');
  });

  // ── PWA asset routes ──────────────────────────────────────────────────

  it('GET /factory-loader.js returns 200 with AGNI_LOADER', async function () {
    const res = await httpGet(port, '/factory-loader.js');
    assert.equal(res.status, 200, '/factory-loader.js route missing or broken');
    assert.ok(res.body.indexOf('AGNI_LOADER') !== -1, 'Response body missing AGNI_LOADER');
  });

  it('GET /sw.js returns 200 with service worker code', async function () {
    const res = await httpGet(port, '/sw.js');
    assert.equal(res.status, 200, '/sw.js route missing');
    assert.ok(res.body.indexOf('PRECACHE') !== -1, 'Response body missing PRECACHE');
  });

  it('GET /manifest.json returns 200 with valid JSON', async function () {
    const res = await httpGet(port, '/manifest.json');
    assert.equal(res.status, 200, '/manifest.json route missing');
    let parsed;
    assert.doesNotThrow(function () { parsed = JSON.parse(res.body); }, 'manifest.json is not valid JSON');
    assert.ok(parsed.name || parsed.short_name, 'manifest.json missing name');
  });

  it('GET /shared.js returns 200 with AGNI_SHARED', async function () {
    const res = await httpGet(port, '/shared.js');
    assert.equal(res.status, 200, '/shared.js route missing');
    assert.ok(res.body.indexOf('AGNI_SHARED') !== -1, 'shared.js does not expose window.AGNI_SHARED');
  });

  it('GET /shell-boot.js returns 200 with renderLesson', async function () {
    const res = await httpGet(port, '/shell-boot.js');
    assert.equal(res.status, 200, '/shell-boot.js route missing');
    assert.ok(res.body.indexOf('renderLesson') !== -1, 'shell-boot.js missing renderLesson function');
  });

  it('GET /library returns 200 HTML with edge-theta and navigator', async function () {
    const res = await httpGet(port, '/library');
    assert.equal(res.status, 200, '/library route missing');
    assert.ok(res.body.indexOf('edge-theta.js') !== -1, 'Library HTML missing edge-theta.js');
    assert.ok(res.body.indexOf('navigator.js') !== -1, 'Library HTML missing navigator.js');
    assert.ok(res.body.indexOf('lesson-list') !== -1, 'Library HTML missing lesson-list container');
  });

  it('GET /library.js returns 200 with initLibrary', async function () {
    const res = await httpGet(port, '/library.js');
    assert.equal(res.status, 200, '/library.js route missing');
    assert.ok(res.body.indexOf('initLibrary') !== -1, 'library.js missing initLibrary');
  });

  it('GET /factories/navigator.js returns 200 with AGNI_NAVIGATOR', async function () {
    const res = await httpGet(port, '/factories/navigator.js');
    assert.equal(res.status, 200, '/factories/navigator.js route missing');
    assert.ok(res.body.indexOf('AGNI_NAVIGATOR') !== -1, 'navigator.js missing AGNI_NAVIGATOR');
  });

  it('GET /factories/edge-theta.js returns 200 with AGNI_EDGE_THETA', async function () {
    const res = await httpGet(port, '/factories/edge-theta.js');
    assert.equal(res.status, 200, '/factories/edge-theta.js route missing');
    assert.ok(res.body.indexOf('AGNI_EDGE_THETA') !== -1, 'edge-theta.js missing AGNI_EDGE_THETA');
  });

  // ── Lesson data route ─────────────────────────────────────────────────

  it('GET /lesson-data.js without slug returns LESSON_DATA = null', async function () {
    const res = await httpGet(port, '/lesson-data.js');
    assert.equal(res.status, 200, '/lesson-data.js route missing');
    assert.ok(res.body.indexOf('LESSON_DATA') !== -1, 'Response missing LESSON_DATA variable');
    assert.ok(res.body.indexOf('null') !== -1, 'Expected null when no slug provided');
  });

  it('GET /lesson-data.js?slug=smoke-test returns non-null LESSON_DATA', async function () {
    const res = await httpGet(port, '/lesson-data.js?slug=smoke-test');
    assert.equal(res.status, 200, '/lesson-data.js route missing');
    assert.ok(res.body.indexOf('LESSON_DATA') !== -1, 'Response missing LESSON_DATA');
    assert.ok(res.body.indexOf('LESSON_DATA = null') === -1,
      'LESSON_DATA is null for slug=smoke-test — lesson compilation failed or slug param not wired');
  });

  // ── Lesson compilation routes ─────────────────────────────────────────

  it('GET /lessons/smoke-test returns 200 HTML with factory-loader and polyfills', async function () {
    const res = await httpGet(port, '/lessons/smoke-test');
    assert.equal(res.status, 200, 'Lesson compilation failed — check compileLesson()');
    assert.ok(res.headers['content-type'].indexOf('html') !== -1, 'Response is not HTML');
    assert.ok(res.body.indexOf('AGNI_LOADER') !== -1,
      'Compiled lesson HTML missing AGNI_LOADER — factory-loader.js not inlined');
    assert.ok(res.body.indexOf('polyfills.js') !== -1,
      'Compiled lesson HTML missing polyfills.js in factory deps');
  });

  it('GET /lessons/smoke-test/sidecar returns valid JSON', async function () {
    const res = await httpGet(port, '/lessons/smoke-test/sidecar');
    assert.equal(res.status, 200, 'Sidecar route failed');
    const sidecar = JSON.parse(res.body);
    assert.ok(sidecar.identifier || sidecar.meta, 'Sidecar missing identifier or meta');
  });

  // ── PWA shell route ────────────────────────────────────────────────────

  it('GET /shell/smoke-test returns 200 HTML with slug-injected lesson-data.js', async function () {
    const res = await httpGet(port, '/shell/smoke-test');
    assert.equal(res.status, 200, '/shell/:slug route missing — shell.html is dead code');
    assert.ok(res.headers['content-type'].indexOf('html') !== -1, 'Response is not HTML');
    assert.ok(res.body.indexOf('lesson-data.js?slug=smoke-test') !== -1,
      'Shell HTML missing slug-injected lesson-data.js script tag');
    assert.ok(res.body.indexOf('polyfills.js') !== -1,
      'Shell HTML missing polyfills.js script tag');
    assert.ok(res.body.indexOf('factory-loader.js') !== -1,
      'Shell HTML missing factory-loader.js script tag');
    assert.ok(res.body.indexOf('shell-boot.js') !== -1,
      'Shell HTML missing shell-boot.js script tag');

    // Regression: Cache-Control must prevent browser from serving cached
    // shell for the wrong slug (H3 fix).
    const cc = res.headers['cache-control'] || '';
    assert.ok(cc.indexOf('no-cache') !== -1 || cc.indexOf('no-store') !== -1,
      'Shell route missing Cache-Control: no-cache — browser may serve wrong lesson');
  });

  it('GET /shell/smoke-test end-to-end: injected lesson-data.js URL returns non-null LESSON_DATA', async function () {
    const shellRes = await httpGet(port, '/shell/smoke-test');
    assert.equal(shellRes.status, 200);
    const srcMatch = shellRes.body.match(/src="(\/lesson-data\.js\?slug=[^"]+)"/);
    assert.ok(srcMatch, 'Could not extract lesson-data.js src from shell HTML');
    const dataRes = await httpGet(port, srcMatch[1]);
    assert.equal(dataRes.status, 200, 'lesson-data.js URL from shell returned ' + dataRes.status);
    assert.ok(dataRes.body.indexOf('LESSON_DATA') !== -1, 'Response missing LESSON_DATA');
    assert.ok(dataRes.body.indexOf('LESSON_DATA = null') === -1,
      'LESSON_DATA is null — slug injection broken or lesson compilation failed');
  });

  // ── Factory dependency ordering and version consistency ────────────────
  // Factory deps are embedded in LESSON_DATA (via lesson-data.js), not in the
  // sidecar. Extract them from the lesson-data.js response.

  it('factory deps order: polyfills first, shared-runtime after binary-utils', async function () {
    const res = await httpGet(port, '/lesson-data.js?slug=smoke-test');
    assert.equal(res.status, 200);
    const match = res.body.match(/var LESSON_DATA = (.+);$/m);
    assert.ok(match, 'Could not extract LESSON_DATA from response');
    const data = JSON.parse(match[1]);
    assert.ok(data.requires, 'LESSON_DATA missing requires');
    const deps = data.requires.factories;
    const files = deps.map(function (d) { return d.file; });

    const polyIdx = files.indexOf('polyfills.js');
    const binaryIdx = files.indexOf('binary-utils.js');
    const sharedIdx = files.indexOf('shared-runtime.js');

    assert.ok(polyIdx !== -1, 'polyfills.js missing from factory deps');
    assert.ok(sharedIdx !== -1, 'shared-runtime.js missing from factory deps');
    assert.equal(polyIdx, 0, 'polyfills.js must be first (index 0), got index ' + polyIdx);
    assert.ok(binaryIdx < sharedIdx,
      'binary-utils.js (idx ' + binaryIdx + ') must come before shared-runtime.js (idx ' + sharedIdx + ')');
  });

  it('GET /lessons/sensor-smoke-test includes sensor-bridge.js when has_sensors', async function () {
    const res = await httpGet(port, '/lesson-data.js?slug=sensor-smoke-test');
    assert.equal(res.status, 200, 'sensor-smoke-test lesson compilation failed');
    const match = res.body.match(/var LESSON_DATA = (.+);$/m);
    assert.ok(match, 'Could not extract LESSON_DATA from response');
    const data = JSON.parse(match[1]);
    assert.ok(data.inferredFeatures && data.inferredFeatures.flags && data.inferredFeatures.flags.has_sensors,
      'sensor-smoke-test should have has_sensors flag');
    const deps = data.requires.factories || [];
    const files = deps.map(function (d) { return d.file; });
    assert.ok(files.indexOf('sensor-bridge.js') !== -1,
      'sensor-bridge.js must be in factory deps when has_sensors — got: ' + files.join(', '));
  });

  it('factory deps versions are consistent and match package.json', async function () {
    const res = await httpGet(port, '/lesson-data.js?slug=smoke-test');
    assert.equal(res.status, 200);
    const match = res.body.match(/var LESSON_DATA = (.+);$/m);
    assert.ok(match, 'Could not extract LESSON_DATA from response');
    const data = JSON.parse(match[1]);
    const deps = data.requires.factories;
    const pkgVersion = require('../../package.json').version;

    const versions = deps.map(function (d) { return d.version; });
    const unique = versions.filter(function (v, i, a) { return a.indexOf(v) === i; });

    assert.equal(unique.length, 1,
      'Factory deps have inconsistent versions: ' + JSON.stringify(unique));
    assert.equal(unique[0], pkgVersion,
      'Factory deps version ' + unique[0] + ' does not match package.json version ' + pkgVersion);
  });

  // ── LTI (R8) ──────────────────────────────────────────────────────────────

  it('GET /lti/xml returns 200 with LTI descriptor', async function () {
    const res = await httpGet(port, '/lti/xml');
    assert.equal(res.status, 200, '/lti/xml route missing');
    assert.ok(res.body.indexOf('cartridge_basiclti_link') !== -1, 'Missing LTI cartridge XML');
    assert.ok(res.body.indexOf('/lti/launch') !== -1, 'Missing launch_url in descriptor');
  });

  it('GET /lti/lessons returns 200 with JSON catalog', async function () {
    const res = await httpGet(port, '/lti/lessons');
    assert.equal(res.status, 200, '/lti/lessons route missing');
    const parsed = JSON.parse(res.body);
    assert.ok(Array.isArray(parsed.lessons), 'Response must have lessons array');
  });

  it('GET /lti/lesson/smoke-test returns 200 with iframe and postMessage listener', async function () {
    const res = await httpGet(port, '/lti/lesson/smoke-test');
    assert.equal(res.status, 200, '/lti/lesson/:slug route missing');
    assert.ok(res.body.indexOf('ols.lessonComplete') !== -1, 'Wrapper missing ols.lessonComplete listener');
    assert.ok(res.body.indexOf('/lessons/smoke-test') !== -1, 'Wrapper missing lesson iframe src');
  });

  it('POST /lti/submit-grade with missing token returns 400', async function () {
    const res = await httpPost(port, '/lti/submit-grade', { score: 0.9 });
    assert.equal(res.status, 400, 'Expected 400 for missing token');
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.ok, false);
  });

  it('POST /lti/submit-grade with invalid token returns 404', async function () {
    const res = await httpPost(port, '/lti/submit-grade', { token: 'invalid-token', score: 0.9 });
    assert.equal(res.status, 404, 'Expected 404 for invalid token');
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.ok, false);
  });
});
