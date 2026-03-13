'use strict';
// tests/unit/mesh.test.js — Mesh protocol and transport tests (R9)

const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.AGNI_DATA_DIR = process.env.AGNI_DATA_DIR || path.join(__dirname, '../../data');

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');

const protocol = require('../../packages/agni-hub/mesh/protocol');
const { createStubTransport, createUdpTransport } = require('../../packages/agni-hub/mesh/transports');
const { createPeerTable } = require('../../packages/agni-hub/mesh/peer-table');
const { mergeEdgeDeltas, sanitizeEdge } = require('../../packages/agni-hub/mesh/merge');
const { chunkGraphWeights, assembleChunks } = require('../../packages/agni-hub/mesh/chunked');

describe('mesh protocol', function () {
  it('builds and parses advertisement', function () {
    const gw = {
      version: '1.0',
      discovered_cohort: 'c_abc123',
      level: 'village',
      edges: [
        { from: 'ols.math:a', to: 'ols.math:b', weight: 0.5, confidence: 0.8 }
      ]
    };
    const ad = protocol.buildAdvertisement('hub-A', gw);
    assert.ok(ad.startsWith('AGNI-M1|'));
    const parsed = protocol.parseAdvertisement(ad);
    assert.ok(parsed);
    assert.equal(parsed.hubId.slice(0, 6), 'hub-A0');
    assert.equal(parsed.edgeCount, 1);
  });

  it('builds and parses edge delta', function () {
    const edges = [
      { from: 'ols.math:fractions', to: 'ols.math:ratios', weight: 0.35, confidence: 0.82 }
    ];
    const pkt = protocol.buildEdgeDelta('hub-B', edges);
    assert.ok(pkt);
    assert.equal(pkt.v, 1);
    assert.equal(pkt.hubId, 'hub-B');
    assert.ok(Array.isArray(pkt.edges));
    const parsed = protocol.parseEdgeDelta(JSON.stringify(pkt));
    assert.ok(parsed);
    assert.equal(parsed.edges[0].from, 'ols.math:fractions');
    assert.equal(parsed.edges[0].to, 'ols.math:ratios');
  });

  it('parseAdvertisement returns null for invalid input', function () {
    assert.strictEqual(protocol.parseAdvertisement(''), null);
    assert.strictEqual(protocol.parseAdvertisement('invalid'), null);
    assert.strictEqual(protocol.parseAdvertisement('AGNI-M1|a'), null);
  });
});

describe('mesh stub transport', function () {
  it('creates stub and logs send', function () {
    var logged = [];
    var log = {
      info: function (msg) { logged.push(msg); }
    };
    const t = createStubTransport({ log });
    t.start();
    t.send(Buffer.from('test'));
    t.stop();
    assert.ok(logged.some(function (m) { return String(m).indexOf('send') >= 0; }));
  });
});

describe('mesh peer table', function () {
  it('adds and rejects duplicate ads', function () {
    const table = createPeerTable({});
    const ad = { hubId: 'h1', graphHash: 'abc', edgeCount: 5, timestamp: Math.floor(Date.now() / 1000) };
    assert.strictEqual(table.add(ad), true);
    assert.strictEqual(table.add(ad), false);
    assert.equal(table.getPeers().length, 1);
  });
});

describe('mesh merge', function () {
  it('sanitizes edges', function () {
    assert.strictEqual(sanitizeEdge({ from: 'a', to: 'a' }), null);
    assert.ok(sanitizeEdge({ from: 'ols:a', to: 'ols:b', weight: 0.5 }));
  });

  it('mergeEdgeDeltas writes graph-weights-mesh', function () {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-merge-'));
    const orig = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = tmpDir;
    try {
      const edges = [
        { from: 'ols.math:x', to: 'ols.math:y', weight: 0.3, confidence: 0.9 }
      ];
      mergeEdgeDeltas(tmpDir, edges, 'hub-X', null);
      const out = path.join(tmpDir, 'graph-weights-mesh.json');
      assert.ok(fs.existsSync(out));
      const data = JSON.parse(fs.readFileSync(out, 'utf8'));
      assert.equal(data.level, 'mesh');
      assert.equal(data.edges.length, 1);
      assert.equal(data.edges[0].from, 'ols.math:x');
    } finally {
      process.env.AGNI_DATA_DIR = orig;
      try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
    }
  });
});

describe('mesh chunked', function () {
  it('chunks and assembles graph', function () {
    const gw = {
      version: '1.0',
      level: 'mesh',
      edges: [{ from: 'a', to: 'b', weight: 0.5, confidence: 1 }]
    };
    const { transferId, chunks } = chunkGraphWeights(gw, 'hub1');
    assert.ok(transferId);
    assert.ok(chunks.length >= 1);
    const assembled = assembleChunks(
      chunks.map(function (p, i) { return [transferId + ':' + i, p]; })
    );
    assert.equal(assembled.length, 1);
    assert.strictEqual(assembled[0].level, 'mesh');
  });
});
