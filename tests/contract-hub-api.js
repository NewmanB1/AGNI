/**
 * Portal–hub API contract tests (Sprint A).
 * Starts theta on an ephemeral port and asserts the hub API responses match
 * the shapes the portal's createHubApi() expects (see portal/src/lib/api.ts and docs/api-contract.md).
 *
 * Run: node tests/contract-hub-api.js
 * Requires Node 18+ (fetch). Exit 0 = pass, 1 = fail.
 */

'use strict';

const http = require('http');

function get(baseUrl, path) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({ statusCode: res.statusCode, data });
        } catch (e) {
          reject(new Error(`${path} parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error(`${path} timeout`)); });
  });
}

function put(baseUrl, path, body) {
  const url = new URL(path, baseUrl);
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch (e) {
            reject(new Error(`${path} parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error(`${path} timeout`)); });
    req.write(bodyStr);
    req.end();
  });
}

function post(baseUrl, path, body) {
  const url = new URL(path, baseUrl);
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch (e) {
            reject(new Error(`${path} parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error(`${path} timeout`)); });
    req.write(bodyStr);
    req.end();
  });
}

async function run(baseUrl) {
  const failures = [];

  // GET /api/theta?pseudoId=test
  try {
    const { statusCode, data } = await get(baseUrl, '/api/theta?pseudoId=test');
    if (statusCode !== 200) failures.push(`/api/theta: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (typeof data.pseudoId !== 'string') failures.push(`/api/theta: missing or invalid pseudoId`);
    if (!Array.isArray(data.lessons)) failures.push(`/api/theta: lessons must be array`);
    if (data.override !== undefined && typeof data.override !== 'string') failures.push(`/api/theta: override must be string if present`);
  } catch (e) {
    failures.push(`/api/theta: ${e.message}`);
  }

  // GET /api/theta/graph
  try {
    const { statusCode, data } = await get(baseUrl, '/api/theta/graph');
    if (statusCode !== 200) failures.push(`/api/theta/graph: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && !Array.isArray(data.edges) && data.edges !== undefined) failures.push(`/api/theta/graph: edges must be array if present`);
  } catch (e) {
    failures.push(`/api/theta/graph: ${e.message}`);
  }

  // GET /api/governance/report
  try {
    const { statusCode, data } = await get(baseUrl, '/api/governance/report');
    if (statusCode !== 200) failures.push(`/api/governance/report: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data.byUtu !== 'object') failures.push(`/api/governance/report: byUtu must be object`);
    if (data && typeof data.bySkill !== 'object') failures.push(`/api/governance/report: bySkill must be object`);
  } catch (e) {
    failures.push(`/api/governance/report: ${e.message}`);
  }

  // GET /api/governance/policy
  try {
    const { statusCode, data } = await get(baseUrl, '/api/governance/policy');
    if (statusCode !== 200) failures.push(`/api/governance/policy: expected 200, got ${statusCode}: ${data.error || ''}`);
  } catch (e) {
    failures.push(`/api/governance/policy: ${e.message}`);
  }

  // POST /api/governance/compliance (minimal sidecar)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/governance/compliance', { identifier: 'test', slug: 'test', title: 'Test', language: 'en', difficulty: 1 });
    if (statusCode !== 200) failures.push(`/api/governance/compliance: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data.status !== 'string') failures.push(`/api/governance/compliance: status must be string`);
    if (data && !Array.isArray(data.issues)) failures.push(`/api/governance/compliance: issues must be array`);
  } catch (e) {
    failures.push(`/api/governance/compliance: ${e.message}`);
  }

  // GET /api/lms/status (200 when engine available, 503 when not)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/lms/status');
    if (statusCode === 503) {
      if (data && typeof data.error !== 'string') failures.push(`/api/lms/status: 503 response should include error string`);
    } else if (statusCode === 200) {
      if (typeof data.students !== 'number' || typeof data.lessons !== 'number') failures.push(`/api/lms/status: students and lessons must be numbers`);
    } else {
      failures.push(`/api/lms/status: expected 200 or 503, got ${statusCode}`);
    }
  } catch (e) {
    failures.push(`/api/lms/status: ${e.message}`);
  }

  // POST /api/author/validate (Sprint C)
  try {
    const minimalLesson = { meta: { title: 'Test', identifier: 'test' }, steps: [{ id: 's1', type: 'instruction', content: 'Hi' }] };
    const { statusCode, data } = await post(baseUrl, '/api/author/validate', minimalLesson);
    if (statusCode !== 200) failures.push(`/api/author/validate: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data.valid !== 'boolean') failures.push(`/api/author/validate: valid must be boolean`);
    if (data && !Array.isArray(data.errors)) failures.push(`/api/author/validate: errors must be array`);
    if (data && !Array.isArray(data.warnings)) failures.push(`/api/author/validate: warnings must be array`);
  } catch (e) {
    failures.push(`/api/author/validate: ${e.message}`);
  }

  // POST /api/author/preview (Sprint C)
  try {
    const minimalLesson = { meta: { title: 'Preview Test', identifier: 'preview-test' }, steps: [{ id: 's1', type: 'instruction', content: 'Preview' }] };
    const { statusCode, data } = await post(baseUrl, '/api/author/preview', minimalLesson);
    if (statusCode !== 200) failures.push(`/api/author/preview: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ir === undefined) failures.push(`/api/author/preview: must return ir`);
    if (data && data.sidecar === undefined) failures.push(`/api/author/preview: must return sidecar`);
  } catch (e) {
    failures.push(`/api/author/preview: ${e.message}`);
  }

  // GET /api/admin/onboarding-status (A3)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/admin/onboarding-status');
    if (statusCode !== 200) failures.push(`/api/admin/onboarding-status: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data.isFirstRun !== 'boolean') failures.push(`/api/admin/onboarding-status: isFirstRun must be boolean`);
  } catch (e) {
    failures.push(`/api/admin/onboarding-status: ${e.message}`);
  }

  // GET /api/admin/config (A1)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/admin/config');
    if (statusCode !== 200) failures.push(`/api/admin/config: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data !== 'object') failures.push(`/api/admin/config: must return object`);
  } catch (e) {
    failures.push(`/api/admin/config: ${e.message}`);
  }

  // PUT /api/admin/config (A1)
  try {
    const cfg = { thetaPort: 8082, dataDir: '' };
    const { statusCode, data } = await put(baseUrl, '/api/admin/config', cfg);
    if (statusCode !== 200) failures.push(`/api/admin/config PUT: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/admin/config PUT: ok must be true`);
  } catch (e) {
    failures.push(`/api/admin/config PUT: ${e.message}`);
  }

  // GET /api/governance/catalog (configuration wizard G2, G4)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/governance/catalog');
    if (statusCode !== 200) failures.push(`/api/governance/catalog: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && !Array.isArray(data.lessonIds)) failures.push(`/api/governance/catalog: lessonIds must be array`);
  } catch (e) {
    failures.push(`/api/governance/catalog: ${e.message}`);
  }

  // POST /api/governance/catalog — add lesson IDs
  try {
    const { statusCode, data } = await post(baseUrl, '/api/governance/catalog', { add: ['ols:test:lesson1'] });
    if (statusCode !== 200) failures.push(`/api/governance/catalog POST: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/governance/catalog POST: ok must be true`);
    if (data && data.catalog && !Array.isArray(data.catalog.lessonIds)) failures.push(`/api/governance/catalog POST: catalog.lessonIds must be array`);
  } catch (e) {
    failures.push(`/api/governance/catalog POST: ${e.message}`);
  }

  // POST /api/governance/catalog/import — replace with empty
  try {
    const { statusCode, data } = await post(baseUrl, '/api/governance/catalog/import', { catalog: { lessonIds: [] }, strategy: 'replace' });
    if (statusCode !== 200) failures.push(`/api/governance/catalog/import: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/governance/catalog/import: ok must be true`);
  } catch (e) {
    failures.push(`/api/governance/catalog/import: ${e.message}`);
  }

  // PUT /api/governance/policy (configuration wizard G1)
  try {
    const policy = { utuTargets: [{ class: 'MAC-2', band: 4 }], minDifficulty: 1, maxDifficulty: 5 };
    const { statusCode, data } = await put(baseUrl, '/api/governance/policy', policy);
    if (statusCode !== 200) failures.push(`/api/governance/policy PUT: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/governance/policy PUT: ok must be true`);
  } catch (e) {
    failures.push(`/api/governance/policy PUT: ${e.message}`);
  }

  // POST /api/theta/override (Phase 3 / Sprint G) — clear override for test student
  try {
    const { statusCode, data } = await post(baseUrl, '/api/theta/override', { pseudoId: 'test', lessonId: null });
    if (statusCode !== 200) failures.push(`/api/theta/override: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/theta/override: ok must be true`);
    if (data && data.override !== undefined && data.override !== null) failures.push(`/api/theta/override: override should be null when clearing`);
  } catch (e) {
    failures.push(`/api/theta/override: ${e.message}`);
  }

  return failures;
}

async function main() {
  const path = require('path');
  const thetaPath = path.join(__dirname, '../hub-tools/theta.js');
  const theta = require(thetaPath);

  let server;
  try {
    theta.rebuildLessonIndex();
  } catch (e) {
    console.warn('[contract-hub-api] rebuildLessonIndex failed (no serve dir?):', e.message);
  }

  server = theta.startApi(0);
  const port = new Promise((resolve) => {
    server.once('listening', () => resolve(server.address().port));
  });
  const actualPort = await port;
  const baseUrl = `http://127.0.0.1:${actualPort}`;

  const failures = await run(baseUrl);
  server.close();

  if (failures.length > 0) {
    console.error('Contract test failures:');
    failures.forEach((f) => console.error('  -', f));
    process.exit(1);
  }
  console.log('Contract tests passed (theta, governance, LMS shapes).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
