/**
 * E2E smoke tests for the AGNI Hub API.
 *
 * These run against a real server instance and verify the core flows work
 * end-to-end: health check, student creation, lesson listing, theta ranking,
 * governance catalog, and learning paths.
 *
 * Setup:
 *   1. npm run init:data
 *   2. AGNI_HUB_API_KEY=e2e-test-hub-key node hub-tools/theta.js
 *      (or: npm run start:hub with AGNI_HUB_API_KEY set)
 *
 * Run:
 *   AGNI_HUB_API_KEY=e2e-test-hub-key npx playwright test
 */
import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

const adminTokenPath = path.join(__dirname, '.e2e-admin-token');
function getAdminToken(): string {
  try {
    return fs.readFileSync(adminTokenPath, 'utf8').trim();
  } catch {
    return '';
  }
}

test.describe('Health & infrastructure', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.version).toBeTruthy();
  });

  test('responses include security headers', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-request-id']).toBeTruthy();
  });

  test('unknown routes return 404', async ({ request }) => {
    const res = await request.get('/api/nonexistent');
    expect(res.status()).toBe(404);
  });
});

test.describe('Student account lifecycle', () => {
  test('create a student account (admin)', async ({ request }) => {
    const token = getAdminToken();
    if (!token) {
      test.skip(true, 'Run npm run init:data first; globalSetup creates admin');
    }
    const res = await request.post('/api/accounts/student', {
      headers: { Authorization: `Bearer ${token}` },
      data: { displayName: 'E2E Student' }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.student.pseudoId).toBeTruthy();
  });
});

test.describe('Lesson & theta ranking', () => {
  test('GET /api/lessons returns lesson list', async ({ request }) => {
    const res = await request.get('/api/lessons');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.lessons)).toBeTruthy();
    expect(typeof body.total).toBe('number');
  });

  test('GET /api/lessons supports pagination', async ({ request }) => {
    const res = await request.get('/api/lessons?limit=2&offset=0');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
  });

  test('GET /api/pathfinder requires pseudoId', async ({ request }) => {
    const res = await request.get('/api/pathfinder');
    expect(res.status()).toBe(400);
  });

  test('GET /api/pathfinder returns ranking for a student', async ({ request }) => {
    const res = await request.get('/api/pathfinder?pseudoId=e2e-test-student');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.pseudoId).toBe('e2e-test-student');
    expect(Array.isArray(body.lessons)).toBeTruthy();
  });

  test('GET /api/pathfinder/all returns all students', async ({ request }) => {
    const token = getAdminToken();
    const res = await request.get('/api/pathfinder/all', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.total).toBe('number');
  });

  test('GET /api/pathfinder/graph returns graph weights', async ({ request }) => {
    const res = await request.get('/api/pathfinder/graph');
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('Governance', () => {
  test('GET /api/governance/catalog returns approved catalog', async ({ request }) => {
    const token = getAdminToken();
    const res = await request.get('/api/governance/catalog', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.lessonIds)).toBeTruthy();
  });

  test('GET /api/governance/report returns report', async ({ request }) => {
    const token = getAdminToken();
    const res = await request.get('/api/governance/report', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('Learning paths & diagnostics', () => {
  test('GET /api/learning-paths returns paths', async ({ request }) => {
    const res = await request.get('/api/learning-paths');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.paths)).toBeTruthy();
  });

  test('POST /api/learning-paths creates a path', async ({ request }) => {
    const token = getAdminToken();
    const res = await request.post('/api/learning-paths', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      data: {
        name: 'E2E Test Path',
        description: 'E2E test path description',
        skills: ['arithmetic', 'fractions']
      }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.path.name).toBe('E2E Test Path');
  });

  test('GET /api/diagnostic returns diagnostic probes', async ({ request }) => {
    const res = await request.get('/api/diagnostic');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.probes)).toBeTruthy();
  });

  test('GET /api/skill-graph returns graph', async ({ request }) => {
    const res = await request.get('/api/skill-graph');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBeTruthy();
    expect(Array.isArray(body.edges)).toBeTruthy();
  });
});

test.describe('LMS engine', () => {
  test('GET /api/lms/status returns engine info', async ({ request }) => {
    const res = await request.get('/api/lms/status');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.students).toBe('number');
    expect(typeof body.observations).toBe('number');
  });
});
