/**
 * Portal–hub API contract tests (Sprint A).
 * Starts theta on an ephemeral port and asserts the hub API responses match
 * the shapes the portal's createHubApi() expects (see portal/src/lib/api.ts and docs/api-contract.md).
 *
 * Run: node tests/contract-hub-api.js
 * Exit 0 = pass, 1 = fail.
 */

'use strict';

const http = require('http');

const CONTRACT_HUB_KEY = process.env.AGNI_HUB_API_KEY || 'contract-test-hub-key';

function get(baseUrl, path, opts) {
  opts = opts || {};
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const headers = { Accept: 'application/json', 'x-hub-key': CONTRACT_HUB_KEY };
    if (opts.bearer) headers['Authorization'] = 'Bearer ' + opts.bearer;
    const req = http.get(url, { headers }, (res) => {
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

function put(baseUrl, path, body, opts) {
  opts = opts || {};
  const url = new URL(path, baseUrl);
  const bodyStr = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), 'x-hub-key': CONTRACT_HUB_KEY };
  if (opts.bearer) headers['Authorization'] = 'Bearer ' + opts.bearer;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'PUT',
        headers
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

function post(baseUrl, path, body, opts) {
  opts = opts || {};
  const url = new URL(path, baseUrl);
  const bodyStr = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), 'x-hub-key': CONTRACT_HUB_KEY };
  if (opts.bearer) headers['Authorization'] = 'Bearer ' + opts.bearer;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers
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

async function run(baseUrl, bearer) {
  const auth = bearer ? { bearer } : {};
  const failures = [];

  // GET /api/pathfinder?pseudoId=test
  try {
    const { statusCode, data } = await get(baseUrl, '/api/pathfinder?pseudoId=test');
    if (statusCode !== 200) failures.push(`/api/pathfinder: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (typeof data.pseudoId !== 'string') failures.push(`/api/pathfinder: missing or invalid pseudoId`);
    if (!Array.isArray(data.lessons)) failures.push(`/api/pathfinder: lessons must be array`);
    if (data.override !== undefined && typeof data.override !== 'string') failures.push(`/api/pathfinder: override must be string if present`);
  } catch (e) {
    failures.push(`/api/pathfinder: ${e.message}`);
  }

  // GET /api/pathfinder/graph
  try {
    const { statusCode, data } = await get(baseUrl, '/api/pathfinder/graph');
    if (statusCode !== 200) failures.push(`/api/pathfinder/graph: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && !Array.isArray(data.edges) && data.edges !== undefined) failures.push(`/api/pathfinder/graph: edges must be array if present`);
  } catch (e) {
    failures.push(`/api/pathfinder/graph: ${e.message}`);
  }

  // GET /api/governance/report (Bearer)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/governance/report', auth);
    if (statusCode !== 200) failures.push(`/api/governance/report: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data.byUtu !== 'object') failures.push(`/api/governance/report: byUtu must be object`);
    if (data && typeof data.bySkill !== 'object') failures.push(`/api/governance/report: bySkill must be object`);
  } catch (e) {
    failures.push(`/api/governance/report: ${e.message}`);
  }

  // GET /api/governance/policy (Bearer)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/governance/policy', auth);
    if (statusCode !== 200) failures.push(`/api/governance/policy: expected 200, got ${statusCode}: ${data.error || ''}`);
  } catch (e) {
    failures.push(`/api/governance/policy: ${e.message}`);
  }

  // POST /api/governance/compliance (Bearer)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/governance/compliance', { identifier: 'test', slug: 'test', title: 'Test', language: 'en', difficulty: 1 }, auth);
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

  // POST /api/author/validate (Bearer)
  try {
    const minimalLesson = { meta: { title: 'Test', identifier: 'test' }, steps: [{ id: 's1', type: 'instruction', content: 'Hi' }] };
    const { statusCode, data } = await post(baseUrl, '/api/author/validate', minimalLesson, auth);
    if (statusCode !== 200) failures.push(`/api/author/validate: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data.valid !== 'boolean') failures.push(`/api/author/validate: valid must be boolean`);
    if (data && !Array.isArray(data.errors)) failures.push(`/api/author/validate: errors must be array`);
    if (data && !Array.isArray(data.warnings)) failures.push(`/api/author/validate: warnings must be array`);
  } catch (e) {
    failures.push(`/api/author/validate: ${e.message}`);
  }

  // POST /api/author/preview (Bearer)
  try {
    const minimalLesson = {
      version: '1.7.0',
      meta: { title: 'Preview Test', identifier: 'preview-test', language: 'en', license: 'CC-BY-SA-4.0', created: '2026-01-01T00:00:00.000Z' },
      steps: [{ id: 's1', type: 'instruction', content: 'Preview' }]
    };
    const { statusCode, data } = await post(baseUrl, '/api/author/preview', minimalLesson, auth);
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

  // GET /api/admin/config (Admin)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/admin/config', auth);
    if (statusCode !== 200) failures.push(`/api/admin/config: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && typeof data !== 'object') failures.push(`/api/admin/config: must return object`);
  } catch (e) {
    failures.push(`/api/admin/config: ${e.message}`);
  }

  // PUT /api/admin/config (Admin)
  try {
    const cfg = { pathfinderPort: 8082, dataDir: '' };
    const { statusCode, data } = await put(baseUrl, '/api/admin/config', cfg, auth);
    if (statusCode !== 200) failures.push(`/api/admin/config PUT: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/admin/config PUT: ok must be true`);
  } catch (e) {
    failures.push(`/api/admin/config PUT: ${e.message}`);
  }

  // GET /api/governance/catalog (Bearer)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/governance/catalog', auth);
    if (statusCode !== 200) failures.push(`/api/governance/catalog: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && !Array.isArray(data.lessonIds)) failures.push(`/api/governance/catalog: lessonIds must be array`);
  } catch (e) {
    failures.push(`/api/governance/catalog: ${e.message}`);
  }

  // POST /api/governance/catalog (Admin)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/governance/catalog', { add: ['ols:test:lesson1'] }, auth);
    if (statusCode !== 200) failures.push(`/api/governance/catalog POST: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/governance/catalog POST: ok must be true`);
    if (data && data.catalog && !Array.isArray(data.catalog.lessonIds)) failures.push(`/api/governance/catalog POST: catalog.lessonIds must be array`);
  } catch (e) {
    failures.push(`/api/governance/catalog POST: ${e.message}`);
  }

  // POST /api/governance/catalog/import (Admin)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/governance/catalog/import', { catalog: { lessonIds: [] }, strategy: 'replace' }, auth);
    if (statusCode !== 200) failures.push(`/api/governance/catalog/import: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/governance/catalog/import: ok must be true`);
  } catch (e) {
    failures.push(`/api/governance/catalog/import: ${e.message}`);
  }

  // PUT /api/governance/policy (Admin)
  try {
    const policy = { utuTargets: [{ class: 'MAC-2', band: 4 }], minDifficulty: 1, maxDifficulty: 5 };
    const { statusCode, data } = await put(baseUrl, '/api/governance/policy', policy, auth);
    if (statusCode !== 200) failures.push(`/api/governance/policy PUT: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/governance/policy PUT: ok must be true`);
  } catch (e) {
    failures.push(`/api/governance/policy PUT: ${e.message}`);
  }

  // POST /api/pathfinder/override (Admin)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/pathfinder/override', { pseudoId: 'test', lessonId: null }, auth);
    if (statusCode !== 200) failures.push(`/api/pathfinder/override: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (data && data.ok !== true) failures.push(`/api/pathfinder/override: ok must be true`);
    if (data && data.override !== undefined && data.override !== null) failures.push(`/api/pathfinder/override: override should be null when clearing`);
  } catch (e) {
    failures.push(`/api/pathfinder/override: ${e.message}`);
  }

  // GET /api/collab/opportunities?pseudoId=test (HubKey)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/collab/opportunities?pseudoId=test');
    if (statusCode !== 200) failures.push(`/api/collab/opportunities: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (!Array.isArray(data.opportunities)) failures.push(`/api/collab/opportunities: opportunities must be array`);
  } catch (e) {
    failures.push(`/api/collab/opportunities: ${e.message}`);
  }

  // POST /api/collab/seek (HubKey)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/collab/seek', { pseudoId: 'test', lessonId: 'test-lesson' });
    if (statusCode !== 200) failures.push(`/api/collab/seek: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (typeof data.status !== 'string') failures.push(`/api/collab/seek: status must be string`);
  } catch (e) {
    failures.push(`/api/collab/seek: ${e.message}`);
  }

  // GET /api/collab/status?pseudoId=test (HubKey)
  try {
    const { statusCode, data } = await get(baseUrl, '/api/collab/status?pseudoId=test');
    if (statusCode !== 200) failures.push(`/api/collab/status: expected 200, got ${statusCode}: ${data.error || ''}`);
    if (typeof data.seeking !== 'boolean') failures.push(`/api/collab/status: seeking must be boolean`);
  } catch (e) {
    failures.push(`/api/collab/status: ${e.message}`);
  }

  // POST /api/collab/cancel-seek (HubKey)
  try {
    const { statusCode, data } = await post(baseUrl, '/api/collab/cancel-seek', { pseudoId: 'test' });
    if (statusCode !== 200) failures.push(`/api/collab/cancel-seek: expected 200, got ${statusCode}: ${data.error || ''}`);
  } catch (e) {
    failures.push(`/api/collab/cancel-seek: ${e.message}`);
  }

  // GET /api/collab/sessions (Bearer)
  if (bearer) {
    try {
      const { statusCode, data } = await get(baseUrl, '/api/collab/sessions', { bearer });
      if (statusCode !== 200) failures.push(`/api/collab/sessions: expected 200, got ${statusCode}: ${data.error || ''}`);
      if (!Array.isArray(data.sessions)) failures.push(`/api/collab/sessions: sessions must be array`);
    } catch (e) {
      failures.push(`/api/collab/sessions: ${e.message}`);
    }
  }

  // POST /api/collab/sessions/:id/deny (Admin) — use invalid id, expect 404
  if (bearer) {
    try {
      const { statusCode } = await post(baseUrl, '/api/collab/sessions/nonexistent-session-id/deny', {}, auth);
      if (statusCode !== 404) failures.push(`/api/collab/sessions/:id/deny: expected 404 for invalid id, got ${statusCode}`);
    } catch (e) {
      failures.push(`/api/collab/sessions/:id/deny: ${e.message}`);
    }
  }

  // Auth regression: HubKey-protected endpoints reject requests without X-Hub-Key
  const getNoKey = (p) => {
    const u = new URL(p, baseUrl);
    return new Promise((resolve, reject) => {
      const req = http.get(u, { headers: { Accept: 'application/json' } }, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data: b ? JSON.parse(b) : {} }));
      });
      req.on('error', reject);
    });
  };
  try {
    const res = await getNoKey('/api/chain/test-slug');
    if (res.statusCode !== 401 && res.statusCode !== 503) {
      failures.push(`/api/chain/:slug without hub key: expected 401 or 503, got ${res.statusCode}`);
    }
  } catch (e) {
    failures.push(`/api/chain auth check: ${e.message}`);
  }

  return failures;
}

async function main() {
  process.env.AGNI_HUB_API_KEY = CONTRACT_HUB_KEY;
  const theta = require('@agni/hub').theta;

  try {
    await theta.rebuildLessonIndex();
  } catch (e) {
    console.warn('[contract-hub-api] rebuildLessonIndex failed (no serve dir?):', e.message);
  }

  const server = theta.startApi(0);
  const port = new Promise((resolve) => {
    server.once('listening', () => resolve(server.address().port));
  });
  const actualPort = await port;
  const baseUrl = `http://127.0.0.1:${actualPort}`;

  let bearer;
  try {
    const accountsService = require('@agni/hub').accounts;
    const reg = await accountsService.registerCreator({ name: 'Contract Admin', email: 'contract@test.local', password: 'testpass123' });
    if (reg.creator) {
      await accountsService.setCreatorApproval(reg.creator.id, true);
      await accountsService.setCreatorRole(reg.creator.id, 'admin');
    }
    const login = await accountsService.loginCreator({ email: 'contract@test.local', password: 'testpass123' });
    bearer = login.token;
  } catch (e) {
    console.warn('[contract-hub-api] creator setup failed:', e.message);
  }

  const failures = await run(baseUrl, bearer);
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
