'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CHECKPOINTS_DIR = path.join(DATA_DIR, 'checkpoints');

function post(baseUrl, urlPath, body) {
  const url = new URL(urlPath, baseUrl);
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
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
    const req = http.get(url, { headers: { Accept: 'application/json' } }, (res) => {
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

describe('Checkpoint sync integration', () => {
  let server, baseUrl;
  const PSEUDO_ID = 'integration-test-ckpt';
  const LESSON_ID = 'ols:test:checkpoint_v1';
  const studentDir = path.join(CHECKPOINTS_DIR, PSEUDO_ID);

  before(async () => {
    const theta = require('../../hub-tools/theta');
    try { await theta.rebuildLessonIndex(); } catch (_) { /* no serve dir */ }
    server = theta.startApi(0);
    const port = await new Promise((r) => server.once('listening', () => r(server.address().port)));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
    if (fs.existsSync(studentDir)) {
      fs.readdirSync(studentDir).forEach(f => fs.unlinkSync(path.join(studentDir, f)));
      fs.rmdirSync(studentDir);
    }
  });

  it('rejects POST /api/checkpoint without pseudoId', async () => {
    const { statusCode, data } = await post(baseUrl, '/api/checkpoint', { lessonId: 'x', stepIndex: 0 });
    assert.equal(statusCode, 400);
    assert.match(data.error, /pseudoId/);
  });

  it('rejects POST /api/checkpoint without lessonId', async () => {
    const { statusCode, data } = await post(baseUrl, '/api/checkpoint', { pseudoId: 'x', stepIndex: 0 });
    assert.equal(statusCode, 400);
    assert.match(data.error, /lessonId/);
  });

  it('rejects POST /api/checkpoint without stepIndex', async () => {
    const { statusCode, data } = await post(baseUrl, '/api/checkpoint', { pseudoId: 'x', lessonId: 'y' });
    assert.equal(statusCode, 400);
    assert.match(data.error, /stepIndex/);
  });

  it('saves and retrieves a checkpoint (round-trip)', async () => {
    const checkpoint = {
      pseudoId: PSEUDO_ID, lessonId: LESSON_ID, stepIndex: 3,
      stepId: 'step_3', stepOutcomes: ['pass', 'fail', 'pass'],
      probeResults: [{ probe: 'temp', value: 22 }], savedAt: Date.now()
    };
    const { statusCode: postCode, data: postData } = await post(baseUrl, '/api/checkpoint', checkpoint);
    assert.equal(postCode, 200);
    assert.equal(postData.ok, true);

    const { statusCode: getCode, data: getData } = await get(
      baseUrl, `/api/checkpoint?pseudoId=${PSEUDO_ID}&lessonId=${LESSON_ID}`
    );
    assert.equal(getCode, 200);
    assert.equal(getData.stepIndex, 3);
    assert.equal(getData.stepId, 'step_3');
    assert.deepEqual(getData.stepOutcomes, ['pass', 'fail', 'pass']);
  });

  it('skips write when savedAt is older than existing', async () => {
    const olderCheckpoint = {
      pseudoId: PSEUDO_ID, lessonId: LESSON_ID, stepIndex: 1,
      savedAt: 1000
    };
    const { statusCode, data } = await post(baseUrl, '/api/checkpoint', olderCheckpoint);
    assert.equal(statusCode, 200);
    assert.equal(data.skipped, true);

    const { data: getData } = await get(
      baseUrl, `/api/checkpoint?pseudoId=${PSEUDO_ID}&lessonId=${LESSON_ID}`
    );
    assert.equal(getData.stepIndex, 3, 'stepIndex should still be 3 from the newer checkpoint');
  });

  it('returns 404 for non-existent checkpoint', async () => {
    const { statusCode } = await get(
      baseUrl, '/api/checkpoint?pseudoId=nobody&lessonId=ols:nonexistent:v1'
    );
    assert.equal(statusCode, 404);
  });

  it('overwrites with newer savedAt', async () => {
    const newer = {
      pseudoId: PSEUDO_ID, lessonId: LESSON_ID, stepIndex: 5,
      stepId: 'step_5', savedAt: Date.now() + 100000
    };
    const { statusCode, data } = await post(baseUrl, '/api/checkpoint', newer);
    assert.equal(statusCode, 200);
    assert.equal(data.ok, true);
    assert.equal(data.skipped, undefined);

    const { data: getData } = await get(
      baseUrl, `/api/checkpoint?pseudoId=${PSEUDO_ID}&lessonId=${LESSON_ID}`
    );
    assert.equal(getData.stepIndex, 5);
  });
});
