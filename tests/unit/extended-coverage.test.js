'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

function tempDir() {
  const dir = path.join(os.tmpdir(), 'agni-ext-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Async json-store tests
// ═══════════════════════════════════════════════════════════════════════════
const { loadJSONAsync, saveJSONAsync, getFileMtimeAsync, loadJSON, saveJSON } = require('../../src/utils/json-store');

describe('loadJSONAsync', () => {
  it('returns fallback for missing file', async () => {
    const result = await loadJSONAsync('/nonexistent/path.json', { default: true });
    assert.deepEqual(result, { default: true });
  });

  it('returns empty object when fallback omitted', async () => {
    const result = await loadJSONAsync('/nonexistent/path.json');
    assert.deepEqual(result, {});
  });

  it('loads a valid JSON file', async () => {
    const dir = tempDir();
    const fp = path.join(dir, 'test.json');
    fs.writeFileSync(fp, JSON.stringify({ hello: 'async' }));
    const result = await loadJSONAsync(fp);
    assert.deepEqual(result, { hello: 'async' });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns fallback for corrupted JSON and creates backup', async () => {
    const dir = tempDir();
    const fp = path.join(dir, 'bad.json');
    fs.writeFileSync(fp, '{not valid json');
    const result = await loadJSONAsync(fp, { fallback: true });
    assert.deepEqual(result, { fallback: true });
    const backups = fs.readdirSync(dir).filter(f => f.includes('.corrupt.'));
    assert.ok(backups.length > 0, 'Expected a .corrupt backup file');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('saveJSONAsync', () => {
  it('writes and reads back correctly', async () => {
    const dir = tempDir();
    const fp = path.join(dir, 'save-async.json');
    await saveJSONAsync(fp, { async: true, count: 7 });
    const result = await loadJSONAsync(fp);
    assert.deepEqual(result, { async: true, count: 7 });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates parent directories', async () => {
    const dir = tempDir();
    const fp = path.join(dir, 'a', 'b', 'c', 'deep.json');
    await saveJSONAsync(fp, { deep: true });
    assert.ok(fs.existsSync(fp));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('supports minified option', async () => {
    const dir = tempDir();
    const fp = path.join(dir, 'min.json');
    await saveJSONAsync(fp, { a: 1, b: 2 }, { minified: true });
    const raw = fs.readFileSync(fp, 'utf8');
    assert.ok(!raw.includes('\n'), 'Minified JSON should not contain newlines');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('getFileMtimeAsync', () => {
  it('returns 0 for missing file', async () => {
    const result = await getFileMtimeAsync('/nonexistent/file.json');
    assert.equal(result, 0);
  });

  it('returns positive for existing file', async () => {
    const dir = tempDir();
    const fp = path.join(dir, 'mtime.json');
    fs.writeFileSync(fp, '{}');
    const mtime = await getFileMtimeAsync(fp);
    assert.ok(mtime > 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Sync json-store error paths
// ═══════════════════════════════════════════════════════════════════════════
describe('json-store error paths', () => {
  it('loadJSON returns fallback for corrupted file and creates backup', () => {
    const dir = tempDir();
    const fp = path.join(dir, 'corrupt.json');
    fs.writeFileSync(fp, '<<<not json>>>');
    const result = loadJSON(fp, { safe: true });
    assert.deepEqual(result, { safe: true });
    const backups = fs.readdirSync(dir).filter(f => f.includes('.corrupt.'));
    assert.ok(backups.length > 0, 'Expected a backup of the corrupted file');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loadJSON returns empty object when no fallback specified', () => {
    const result = loadJSON('/nonexistent/path.json');
    assert.deepEqual(result, {});
  });

  it('saveJSON with minified option produces compact JSON', () => {
    const dir = tempDir();
    const fp = path.join(dir, 'minified.json');
    saveJSON(fp, { a: 1, b: [2, 3] }, { minified: true });
    const raw = fs.readFileSync(fp, 'utf8');
    assert.ok(!raw.includes('\n'), 'Minified output should be single-line');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, { a: 1, b: [2, 3] });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Logger tests
// ═══════════════════════════════════════════════════════════════════════════
const { createLogger } = require('../../src/utils/logger');

describe('logger structured output', () => {
  it('logger.info outputs valid JSON to stdout', (t) => {
    const original = console.log;
    let captured = null;
    console.log = (line) => { captured = line; };
    try {
      const log = createLogger('test-unit');
      log.info('hello test', { extra: 42 });
      assert.ok(captured, 'Expected console.log to be called');
      const parsed = JSON.parse(captured);
      assert.equal(parsed.level, 'info');
      assert.equal(parsed.component, 'test-unit');
      assert.equal(parsed.msg, 'hello test');
      assert.equal(parsed.extra, 42);
      assert.ok(parsed.ts, 'Expected timestamp');
    } finally {
      console.log = original;
    }
  });

  it('logger.error outputs to console.error', () => {
    const original = console.error;
    let captured = null;
    console.error = (line) => { captured = line; };
    try {
      const log = createLogger('err-test');
      log.error('something broke', { code: 500 });
      const parsed = JSON.parse(captured);
      assert.equal(parsed.level, 'error');
      assert.equal(parsed.component, 'err-test');
      assert.equal(parsed.code, 500);
    } finally {
      console.error = original;
    }
  });

  it('logger.warn outputs to console.warn', () => {
    const original = console.warn;
    let captured = null;
    console.warn = (line) => { captured = line; };
    try {
      const log = createLogger('warn-test');
      log.warn('caution');
      const parsed = JSON.parse(captured);
      assert.equal(parsed.level, 'warn');
    } finally {
      console.warn = original;
    }
  });

  it('writes to logFile when configured', async () => {
    const dir = tempDir();
    const logPath = path.join(dir, 'test.log');
    const log = createLogger('file-test', { logFile: logPath });
    log.info('file entry', { key: 'val' });
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok(fs.existsSync(logPath), 'Log file should exist');
    const content = fs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    assert.equal(parsed.component, 'file-test');
    assert.equal(parsed.msg, 'file entry');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Engine error / edge case tests
// ═══════════════════════════════════════════════════════════════════════════
const rasch = require('../../src/engine/rasch');
const thompson = require('../../src/engine/thompson');
const embeddings = require('../../src/engine/embeddings');
const migrations = require('../../src/engine/migrations');
const { createState, seedProbes } = require('../helpers/engine-state');

describe('rasch edge cases', () => {
  it('handles NaN correct input gracefully', () => {
    const state = createState();
    seedProbes(state, [['p1', 0, 'math']]);
    const delta = rasch.updateAbility(state, 'stu', [{ probeId: 'p1', correct: NaN }]);
    assert.ok(state.rasch.students['stu'] !== undefined, 'Student should be initialized');
    const ability = state.rasch.students['stu'].ability;
    assert.ok(Number.isFinite(ability), 'Ability should be finite even with NaN input');
  });

  it('handles zero-length probe results', () => {
    const state = createState();
    state.rasch.students['stu'] = { ability: 0, variance: 1 };
    rasch.updateAbility(state, 'stu', []);
    assert.equal(state.rasch.students['stu'].ability, 0);
  });

  it('handles unknown probeId in results', () => {
    const state = createState();
    const delta = rasch.updateAbility(state, 'stu', [{ probeId: 'nonexistent', correct: true }]);
    assert.equal(typeof delta, 'number');
  });
});

describe('thompson edge cases', () => {
  it('selectLesson returns null for empty candidate set', () => {
    const state = createState();
    thompson.ensureBanditInitialized(state);
    const result = thompson.selectLesson(state, 'stu', []);
    assert.equal(result, null);
  });

  it('updateBandit handles zero reward without crashing', () => {
    const state = createState();
    thompson.ensureBanditInitialized(state);
    embeddings.ensureStudentVector(state, 'stu');
    embeddings.ensureLessonVector(state, 'L1');
    assert.doesNotThrow(() => {
      thompson.updateBandit(state, 'stu', 'L1', 0.0);
    });
  });

  it('updateBandit handles reward of exactly 1.0', () => {
    const state = createState();
    thompson.ensureBanditInitialized(state);
    embeddings.ensureStudentVector(state, 'stu');
    embeddings.ensureLessonVector(state, 'L1');
    assert.doesNotThrow(() => {
      thompson.updateBandit(state, 'stu', 'L1', 1.0);
    });
    assert.equal(state.bandit.observationCount, 1);
  });
});

describe('migrations edge cases', () => {
  it('handles deeply corrupted state gracefully', () => {
    const result = migrations.migrateLMSState({ rasch: 'not-an-object', embedding: null, bandit: 42 });
    assert.ok(result.state);
    assert.ok(result.state.rasch.students);
    assert.ok(typeof result.state.bandit.observationCount === 'number');
  });

  it('handles undefined input', () => {
    const result = migrations.migrateLMSState(undefined);
    assert.ok(result.state);
    assert.ok(result.state.rasch.globalAnchor);
  });

  it('preserves valid observation count', () => {
    const input = migrations.migrateLMSState(null).state;
    input.bandit.observationCount = 999;
    const result = migrations.migrateLMSState(input);
    assert.equal(result.state.bandit.observationCount, 999);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Extended API integration tests
// ═══════════════════════════════════════════════════════════════════════════
var EXT_TEST_HUB_KEY = 'test-hub-key-for-ext-tests';

function apiRequest(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'x-hub-key': EXT_TEST_HUB_KEY };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method, headers
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

describe('Extended API tests', () => {
  let server;
  let port;
  let dataDir;
  let adminToken;

  before(async () => {
    dataDir = tempDir();
    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = path.join(dataDir, 'serve');
    process.env.AGNI_HUB_API_KEY = EXT_TEST_HUB_KEY;

    // Clear ALL project modules from cache so env-config picks up the new DATA_DIR.
    // The theta module tree is large — partial clearing leaves stale references.
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

    const { accountsService } = require('../../hub-tools/context/services');
    const reg = await accountsService.registerCreator({
      name: 'Ext Admin', email: 'ext-admin@test.local', password: 'testpass123'
    });
    if (reg.creator) {
      await accountsService.setCreatorApproval(reg.creator.id, true);
      await accountsService.setCreatorRole(reg.creator.id, 'admin');
    }
    const login = await accountsService.loginCreator({ email: 'ext-admin@test.local', password: 'testpass123' });
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
    delete require.cache[require.resolve('../../src/utils/env-config')];
    delete require.cache[require.resolve('../../src/services/accounts')];
    delete require.cache[require.resolve('../../hub-tools/context/auth')];
    delete require.cache[require.resolve('../../hub-tools/context/services')];
  });

  it('GET /health returns status ok', async () => {
    const res = await apiRequest(port, 'GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptime, 'number');
    assert.ok(res.body.version);
  });

  it('GET /api/lessons supports pagination', async () => {
    const res = await apiRequest(port, 'GET', '/api/lessons?limit=5&offset=0');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total, 'number');
    assert.equal(typeof res.body.limit, 'number');
    assert.equal(typeof res.body.offset, 'number');
    assert.ok(Array.isArray(res.body.lessons));
  });

  it('GET /api/theta/all supports pagination', async () => {
    const res = await apiRequest(port, 'GET', '/api/theta/all?limit=2&offset=0', null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total, 'number');
    assert.equal(typeof res.body.limit, 'number');
    assert.equal(typeof res.body.offset, 'number');
  });

  it('request logging includes requestId header', async () => {
    const res = await apiRequest(port, 'GET', '/health');
    assert.ok(res.headers['x-request-id'], 'Expected X-Request-Id header');
  });

  it('POST /api/telemetry rejects empty body', async () => {
    const res = await apiRequest(port, 'POST', '/api/telemetry', {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.accepted, []);
  });

  it('GET /api/lms/status returns engine info or 503', async () => {
    const res = await apiRequest(port, 'GET', '/api/lms/status');
    assert.ok(res.status === 200 || res.status === 503);
  });

  it('GET /api/governance/catalog returns catalog', async () => {
    const res = await apiRequest(port, 'GET', '/api/governance/catalog', null, adminToken);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.lessonIds));
  });

  it('GET /api/diagnostic returns probes', async () => {
    const res = await apiRequest(port, 'GET', '/api/diagnostic');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.probes));
  });

  it('GET /api/learning-paths returns paths', async () => {
    const res = await apiRequest(port, 'GET', '/api/learning-paths');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.paths));
  });

  it('POST /api/learning-paths creates a path with 201', async () => {
    const res = await apiRequest(port, 'POST', '/api/learning-paths', {
      name: 'Test Path', description: 'Test learning path for algebra skills', skills: ['algebra']
    }, adminToken);
    assert.equal(res.status, 201);
    assert.ok(res.body.ok);
    assert.equal(res.body.path.name, 'Test Path');
  });

  it('GET /api/skill-graph returns graph data', async () => {
    const res = await apiRequest(port, 'GET', '/api/skill-graph');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.nodes));
    assert.ok(Array.isArray(res.body.edges));
  });

  it('GET /api/admin/onboarding-status returns isFirstRun', async () => {
    const res = await apiRequest(port, 'GET', '/api/admin/onboarding-status');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.isFirstRun, 'boolean');
  });

  it('POST /api/author/validate validates lesson input', async () => {
    const res = await apiRequest(port, 'POST', '/api/author/validate', { body: '' }, adminToken);
    assert.ok(res.status === 200 || res.status === 400);
  });

  it('GET /api/chain/:slug returns chain for nonexistent slug', async () => {
    const res = await apiRequest(port, 'GET', '/api/chain/nonexistent-slug');
    assert.equal(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Paginate utility test
// ═══════════════════════════════════════════════════════════════════════════
describe('paginate utility', () => {
  const { paginate } = require('../../hub-tools/shared');

  it('returns all items when no limit/offset', () => {
    const result = paginate([1, 2, 3, 4, 5], {});
    assert.deepEqual(result.items, [1, 2, 3, 4, 5]);
    assert.equal(result.total, 5);
    assert.equal(result.offset, 0);
  });

  it('respects limit', () => {
    const result = paginate([1, 2, 3, 4, 5], { limit: '2' });
    assert.deepEqual(result.items, [1, 2]);
    assert.equal(result.total, 5);
    assert.equal(result.limit, 2);
  });

  it('respects offset', () => {
    const result = paginate([1, 2, 3, 4, 5], { limit: '2', offset: '2' });
    assert.deepEqual(result.items, [3, 4]);
    assert.equal(result.total, 5);
    assert.equal(result.offset, 2);
  });

  it('clamps limit to 1000', () => {
    const result = paginate([1], { limit: '9999' });
    assert.equal(result.limit, 1000);
  });

  it('handles offset beyond array length', () => {
    const result = paginate([1, 2], { offset: '100' });
    assert.deepEqual(result.items, []);
    assert.equal(result.total, 2);
  });

  it('handles negative offset as 0', () => {
    const result = paginate([1, 2, 3], { offset: '-5', limit: '2' });
    assert.deepEqual(result.items, [1, 2]);
    assert.equal(result.offset, 0);
  });
});
