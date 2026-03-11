'use strict';

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TEL_PATH = path.join(DATA_DIR, 'telemetry-events.json');
const HUB_KEY = 'integration-test-hub-key';

function post(baseUrl, urlPath, body) {
  const url = new URL(urlPath, baseUrl);
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'x-hub-key': HUB_KEY, 'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : {} }); }
        catch (e) { reject(new Error(`${urlPath} parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error(`${urlPath} timeout`)); });
    req.write(bodyStr);
    req.end();
  });
}

function get(baseUrl, urlPath) {
  const url = new URL(urlPath, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Accept: 'application/json', 'x-hub-key': HUB_KEY } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: body ? JSON.parse(body) : {} }); }
        catch (e) { reject(new Error(`${urlPath} parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error(`${urlPath} timeout`)); });
  });
}

describe('Frustration-Theta feedback loop integration', () => {
  let server, baseUrl;
  let originalTelemetry;
  const PSEUDO_ID = 'integration-test-frust';

  before(async () => {
    if (fs.existsSync(TEL_PATH)) {
      originalTelemetry = fs.readFileSync(TEL_PATH, 'utf8');
    }

    process.env.AGNI_HUB_API_KEY = HUB_KEY;
    const theta = require('@agni/hub').theta;
    try { await theta.rebuildLessonIndex(); } catch { /* ok */ }
    server = theta.startApi(0);
    const port = await new Promise((r) => server.once('listening', () => r(server.address().port)));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
    if (originalTelemetry !== undefined) {
      fs.writeFileSync(TEL_PATH, originalTelemetry);
    }
  });

  it('theta returns lessons for a student with no frustration history', async () => {
    const { statusCode, data } = await get(baseUrl, `/api/theta?pseudoId=${PSEUDO_ID}`);
    assert.equal(statusCode, 200);
    assert.ok(Array.isArray(data.lessons), 'lessons should be an array');

    for (const lesson of data.lessons) {
      assert.equal(lesson.frustrationPenalty, undefined,
        `No frustration history should mean no frustrationPenalty on ${lesson.lessonId}`);
    }
  });

  it('injecting frustration telemetry affects theta scores', async () => {
    const { statusCode: thetaCode, data: thetaData } = await get(baseUrl, `/api/theta?pseudoId=${PSEUDO_ID}`);
    assert.equal(thetaCode, 200);
    if (thetaData.lessons.length === 0) return;

    const targetLesson = thetaData.lessons[0].lessonId;
    const baselineScores = {};
    for (const l of thetaData.lessons) {
      baselineScores[l.lessonId] = l.theta;
    }

    const telData = fs.existsSync(TEL_PATH)
      ? JSON.parse(fs.readFileSync(TEL_PATH, 'utf8'))
      : { events: [] };
    if (!telData.events) telData.events = [];

    for (let i = 0; i < 5; i++) {
      telData.events.push({
        pseudoId: PSEUDO_ID,
        lessonId: targetLesson,
        timestamp: new Date().toISOString(),
        frustrationTotal: 8,
        frustrationEvents: [
          { stepId: 's1', trigger: 'consecutive_fails' },
          { stepId: 's2', trigger: 'consecutive_skips' },
          { stepId: 's3', trigger: 'consecutive_fails' }
        ],
        mastery: 0.2,
        score: 0.3
      });
    }
    fs.writeFileSync(TEL_PATH, JSON.stringify(telData, null, 2));

    const { statusCode: afterCode, data: afterData } = await get(baseUrl, `/api/theta?pseudoId=${PSEUDO_ID}`);
    assert.equal(afterCode, 200);

    const targetAfter = afterData.lessons.find(l => l.lessonId === targetLesson);
    if (targetAfter) {
      assert.ok(targetAfter.frustrationPenalty > 0,
        `Lesson ${targetLesson} should have a positive frustrationPenalty after frustration events`);
      assert.ok(targetAfter.theta >= baselineScores[targetLesson],
        `Theta score for ${targetLesson} should be >= baseline (penalty increases theta, pushing lesson down)`);
    }
  });

  it('frustrationPenalty does not appear on unaffected lessons', async () => {
    const { data } = await get(baseUrl, `/api/theta?pseudoId=${PSEUDO_ID}`);
    const lessons = data.lessons || [];
    const targetLesson = lessons.length > 0 ? lessons[0].lessonId : null;

    for (const l of lessons) {
      if (l.lessonId !== targetLesson && l.frustrationPenalty !== undefined) {
        assert.equal(l.frustrationPenalty, undefined,
          `Lesson ${l.lessonId} should not have frustrationPenalty (no frustration recorded for it)`);
      }
    }
  });

  it('telemetry POST /api/telemetry accepts frustration fields', async () => {
    const payload = {
      pseudoId: PSEUDO_ID,
      lessonId: 'ols:test:frust_tel_v1',
      score: 0.5,
      mastery: 0.4,
      frustrationTotal: 3,
      frustrationEvents: [
        { stepId: 'q1', trigger: 'consecutive_fails' }
      ]
    };
    const { statusCode } = await post(baseUrl, '/api/telemetry', payload);
    assert.ok([200, 201, 204].includes(statusCode),
      `POST /api/telemetry should accept frustration fields (got ${statusCode})`);
  });
});
