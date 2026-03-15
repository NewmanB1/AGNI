'use strict';
// packages/agni-hub/mesh/chunked.js — Chunked full-graph transfer (R9 Phase 6)
// Splits graph_weights into ~200-byte chunks for LoRa transport.

const crypto = require('crypto');
const CHUNK_SIZE = 200;

function chunkGraphWeights(gw, _hubId) {
  const json = JSON.stringify(gw);
  const buf = Buffer.from(json, 'utf8');
  const chunks = [];
  for (let i = 0; i < buf.length; i += CHUNK_SIZE) {
    const slice = buf.slice(i, i + CHUNK_SIZE);
    chunks.push(slice.toString('base64'));
  }
  const transferId = crypto.randomBytes(4).toString('hex');
  return { transferId, chunks };
}

function assembleChunks(chunkMap) {
  const byTransfer = new Map();
  for (const [key, chunk] of chunkMap) {
    const [transferId, idx] = key.split(':');
    if (!byTransfer.has(transferId)) byTransfer.set(transferId, {});
    byTransfer.get(transferId)[parseInt(idx, 10)] = chunk;
  }
  const results = [];
  for (const [, chunks] of byTransfer) {
    const indices = Object.keys(chunks).map(Number).sort((a, b) => a - b);
    const total = Math.max(...indices) + 1;
    if (indices.length !== total) continue;
    let buf = '';
    for (let i = 0; i < total; i++) {
      buf += Buffer.from(chunks[i], 'base64').toString('utf8');
    }
    try {
      results.push(JSON.parse(buf));
    } catch { /* skip corrupted */ }
  }
  return results;
}

module.exports = { chunkGraphWeights, CHUNK_SIZE, assembleChunks };
