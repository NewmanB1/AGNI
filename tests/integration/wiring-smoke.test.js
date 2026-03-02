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

const { describe, it, before, after } = require('node:test');
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

function httpGet(port, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1', port: port, path: urlPath, method: 'GET',
      headers: { Accept: '*/*', 'x-hub-key': SMOKE_HUB_KEY }
    }, function (res) {
      var data = '';
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

describe('Wiring smoke tests', function () {
  var server, port, dataDir;

  before(async function () {
    dataDir = path.join(os.tmpdir(), 'agni-wiring-smoke-' + Date.now());
    fs.mkdirSync(dataDir, { recursive: true });

    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = path.join(dataDir, 'serve');
    process.env.AGNI_HUB_API_KEY = SMOKE_HUB_KEY;

    // Purge all project modules so env-config picks up the new DATA_DIR
    var rootNorm = path.resolve(__dirname, '../..').replace(/\\/g, '/');
    Object.keys(require.cache).forEach(function (key) {
      var norm = key.replace(/\\/g, '/');
      if (norm.startsWith(rootNorm) && !norm.includes('node_modules')) {
        delete require.cache[key];
      }
    });

    fs.mkdirSync(process.env.AGNI_SERVE_DIR, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'mastery-summary.json'), JSON.stringify({ students: {} }));
    fs.writeFileSync(path.join(dataDir, 'lesson-index.json'), JSON.stringify([]));
    fs.writeFileSync(path.join(dataDir, 'approved-catalog.json'), JSON.stringify({ lessonIds: [] }));

    // Copy data files the compiler needs (archetypes, utu-constants)
    var projectDataDir = path.resolve(__dirname, '../../data');
    ['archetypes.json', 'utu-constants.json'].forEach(function (f) {
      var src = path.join(projectDataDir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dataDir, f));
    });

    // Write a minimal YAML lesson so /lessons/smoke-test compiles
    var yamlDir = path.join(dataDir, 'yaml');
    fs.mkdirSync(yamlDir, { recursive: true });
    fs.writeFileSync(path.join(yamlDir, 'smoke-test.yaml'), MINIMAL_LESSON_YAML);

    var theta = require('../../hub-tools/theta');
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

    var rootNorm = path.resolve(__dirname, '../..').replace(/\\/g, '/');
    Object.keys(require.cache).forEach(function (key) {
      var norm = key.replace(/\\/g, '/');
      if (norm.startsWith(rootNorm) && !norm.includes('node_modules')) {
        delete require.cache[key];
      }
    });
  });

  // ── Factory routes (proves hub-transform.attachRoutes succeeded) ───────

  it('GET /factories/shared-runtime.js returns 200 with JS', async function () {
    var res = await httpGet(port, '/factories/shared-runtime.js');
    assert.equal(res.status, 200, 'shared-runtime.js not served — hub-transform.attachRoutes may have failed silently');
    assert.ok(res.headers['content-type'].indexOf('javascript') !== -1);
    assert.ok(res.body.indexOf('AGNI_SHARED') !== -1, 'Response body missing AGNI_SHARED — wrong file served');
  });

  it('GET /factories/polyfills.js returns 200 with polyfill content', async function () {
    var res = await httpGet(port, '/factories/polyfills.js');
    assert.equal(res.status, 200, 'polyfills.js not served — check ALLOWED_FACTORY_FILES');
    assert.ok(res.body.indexOf('String.prototype') !== -1, 'Response body missing String.prototype polyfill');
  });

  // ── PWA asset routes ──────────────────────────────────────────────────

  it('GET /factory-loader.js returns 200 with AGNI_LOADER', async function () {
    var res = await httpGet(port, '/factory-loader.js');
    assert.equal(res.status, 200, '/factory-loader.js route missing or broken');
    assert.ok(res.body.indexOf('AGNI_LOADER') !== -1, 'Response body missing AGNI_LOADER');
  });

  it('GET /sw.js returns 200 with service worker code', async function () {
    var res = await httpGet(port, '/sw.js');
    assert.equal(res.status, 200, '/sw.js route missing');
    assert.ok(res.body.indexOf('PRECACHE') !== -1, 'Response body missing PRECACHE');
  });

  it('GET /manifest.json returns 200 with valid JSON', async function () {
    var res = await httpGet(port, '/manifest.json');
    assert.equal(res.status, 200, '/manifest.json route missing');
    var parsed;
    assert.doesNotThrow(function () { parsed = JSON.parse(res.body); }, 'manifest.json is not valid JSON');
    assert.ok(parsed.name || parsed.short_name, 'manifest.json missing name');
  });

  it('GET /shared.js returns 200 with AGNI_SHARED', async function () {
    var res = await httpGet(port, '/shared.js');
    assert.equal(res.status, 200, '/shared.js route missing');
    assert.ok(res.body.indexOf('AGNI_SHARED') !== -1, 'shared.js does not expose window.AGNI_SHARED');
  });

  it('GET /shell-boot.js returns 200 with renderLesson', async function () {
    var res = await httpGet(port, '/shell-boot.js');
    assert.equal(res.status, 200, '/shell-boot.js route missing');
    assert.ok(res.body.indexOf('renderLesson') !== -1, 'shell-boot.js missing renderLesson function');
  });

  // ── Lesson data route ─────────────────────────────────────────────────

  it('GET /lesson-data.js without slug returns LESSON_DATA = null', async function () {
    var res = await httpGet(port, '/lesson-data.js');
    assert.equal(res.status, 200, '/lesson-data.js route missing');
    assert.ok(res.body.indexOf('LESSON_DATA') !== -1, 'Response missing LESSON_DATA variable');
    assert.ok(res.body.indexOf('null') !== -1, 'Expected null when no slug provided');
  });

  it('GET /lesson-data.js?slug=smoke-test returns non-null LESSON_DATA', async function () {
    var res = await httpGet(port, '/lesson-data.js?slug=smoke-test');
    assert.equal(res.status, 200, '/lesson-data.js route missing');
    assert.ok(res.body.indexOf('LESSON_DATA') !== -1, 'Response missing LESSON_DATA');
    assert.ok(res.body.indexOf('LESSON_DATA = null') === -1,
      'LESSON_DATA is null for slug=smoke-test — lesson compilation failed or slug param not wired');
  });

  // ── Lesson compilation routes ─────────────────────────────────────────

  it('GET /lessons/smoke-test returns 200 HTML with factory-loader and polyfills', async function () {
    var res = await httpGet(port, '/lessons/smoke-test');
    assert.equal(res.status, 200, 'Lesson compilation failed — check compileLesson()');
    assert.ok(res.headers['content-type'].indexOf('html') !== -1, 'Response is not HTML');
    assert.ok(res.body.indexOf('AGNI_LOADER') !== -1,
      'Compiled lesson HTML missing AGNI_LOADER — factory-loader.js not inlined');
    assert.ok(res.body.indexOf('polyfills.js') !== -1,
      'Compiled lesson HTML missing polyfills.js in factory deps');
  });

  it('GET /lessons/smoke-test/sidecar returns valid JSON', async function () {
    var res = await httpGet(port, '/lessons/smoke-test/sidecar');
    assert.equal(res.status, 200, 'Sidecar route failed');
    var sidecar = JSON.parse(res.body);
    assert.ok(sidecar.identifier || sidecar.meta, 'Sidecar missing identifier or meta');
  });

  // ── PWA shell route ────────────────────────────────────────────────────

  it('GET /shell/smoke-test returns 200 HTML with slug-injected lesson-data.js', async function () {
    var res = await httpGet(port, '/shell/smoke-test');
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
    var cc = res.headers['cache-control'] || '';
    assert.ok(cc.indexOf('no-cache') !== -1 || cc.indexOf('no-store') !== -1,
      'Shell route missing Cache-Control: no-cache — browser may serve wrong lesson');
  });

  it('GET /shell/smoke-test end-to-end: injected lesson-data.js URL returns non-null LESSON_DATA', async function () {
    var shellRes = await httpGet(port, '/shell/smoke-test');
    assert.equal(shellRes.status, 200);
    var srcMatch = shellRes.body.match(/src="(\/lesson-data\.js\?slug=[^"]+)"/);
    assert.ok(srcMatch, 'Could not extract lesson-data.js src from shell HTML');
    var dataRes = await httpGet(port, srcMatch[1]);
    assert.equal(dataRes.status, 200, 'lesson-data.js URL from shell returned ' + dataRes.status);
    assert.ok(dataRes.body.indexOf('LESSON_DATA') !== -1, 'Response missing LESSON_DATA');
    assert.ok(dataRes.body.indexOf('LESSON_DATA = null') === -1,
      'LESSON_DATA is null — slug injection broken or lesson compilation failed');
  });

  // ── Factory dependency ordering and version consistency ────────────────
  // Factory deps are embedded in LESSON_DATA (via lesson-data.js), not in the
  // sidecar. Extract them from the lesson-data.js response.

  it('factory deps order: polyfills first, shared-runtime after binary-utils', async function () {
    var res = await httpGet(port, '/lesson-data.js?slug=smoke-test');
    assert.equal(res.status, 200);
    var match = res.body.match(/var LESSON_DATA = (.+);$/m);
    assert.ok(match, 'Could not extract LESSON_DATA from response');
    var data = JSON.parse(match[1]);
    assert.ok(data.requires, 'LESSON_DATA missing requires');
    var deps = data.requires.factories;
    var files = deps.map(function (d) { return d.file; });

    var polyIdx = files.indexOf('polyfills.js');
    var binaryIdx = files.indexOf('binary-utils.js');
    var sharedIdx = files.indexOf('shared-runtime.js');

    assert.ok(polyIdx !== -1, 'polyfills.js missing from factory deps');
    assert.ok(sharedIdx !== -1, 'shared-runtime.js missing from factory deps');
    assert.equal(polyIdx, 0, 'polyfills.js must be first (index 0), got index ' + polyIdx);
    assert.ok(binaryIdx < sharedIdx,
      'binary-utils.js (idx ' + binaryIdx + ') must come before shared-runtime.js (idx ' + sharedIdx + ')');
  });

  it('factory deps versions are consistent and match package.json', async function () {
    var res = await httpGet(port, '/lesson-data.js?slug=smoke-test');
    assert.equal(res.status, 200);
    var match = res.body.match(/var LESSON_DATA = (.+);$/m);
    assert.ok(match, 'Could not extract LESSON_DATA from response');
    var data = JSON.parse(match[1]);
    var deps = data.requires.factories;
    var pkgVersion = require('../../package.json').version;

    var versions = deps.map(function (d) { return d.version; });
    var unique = versions.filter(function (v, i, a) { return a.indexOf(v) === i; });

    assert.equal(unique.length, 1,
      'Factory deps have inconsistent versions: ' + JSON.stringify(unique));
    assert.equal(unique[0], pkgVersion,
      'Factory deps version ' + unique[0] + ' does not match package.json version ' + pkgVersion);
  });
});
