/**
 * E2E smoke tests for the AGNI Hub API.
 *
 * These run against a real server instance and verify the core flows work
 * end-to-end: health check, student creation, lesson listing, theta ranking,
 * governance catalog, and learning paths.
 *
 * Before running: start the server on AGNI_TEST_PORT (default 8082).
 *   AGNI_DATA_DIR=./data node hub-tools/theta.js
 *
 * Run:
 *   npx playwright test
 */
import { test, expect } from '@playwright/test';

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
  const uniqueEmail = `e2e-${Date.now()}@test.agni`;
  let token = '';

  test('register a new creator account', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { name: 'E2E Test Creator', email: uniqueEmail, password: 'testPass1234' }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    token = body.token || '';
  });

  test('login with the new creator account', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: uniqueEmail, password: 'testPass1234' }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.token).toBeTruthy();
    token = body.token;
  });

  test('create a student account', async ({ request }) => {
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

  test('GET /api/theta requires pseudoId', async ({ request }) => {
    const res = await request.get('/api/theta');
    expect(res.status()).toBe(400);
  });

  test('GET /api/theta returns ranking for a student', async ({ request }) => {
    const res = await request.get('/api/theta?pseudoId=e2e-test-student');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.pseudoId).toBe('e2e-test-student');
    expect(Array.isArray(body.lessons)).toBeTruthy();
  });

  test('GET /api/theta/all returns all students', async ({ request }) => {
    const res = await request.get('/api/theta/all');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.total).toBe('number');
  });

  test('GET /api/theta/graph returns graph weights', async ({ request }) => {
    const res = await request.get('/api/theta/graph');
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('Governance', () => {
  test('GET /api/governance/catalog returns approved catalog', async ({ request }) => {
    const res = await request.get('/api/governance/catalog');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.lessonIds)).toBeTruthy();
  });

  test('GET /api/governance/report returns report', async ({ request }) => {
    const res = await request.get('/api/governance/report');
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
    const res = await request.post('/api/learning-paths', {
      data: { name: 'E2E Test Path', skills: ['arithmetic', 'fractions'] }
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
