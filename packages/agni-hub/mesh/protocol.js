'use strict';
// packages/agni-hub/mesh/protocol.js — Mesh packet formats (R9)
// Build and parse advertisement (Phase 1/4) and edge-delta (Phase 5) packets.
// See docs/playbooks/mesh-lora.md.

const crypto = require('crypto');

const AD_PREFIX = 'AGNI-M1|';
const EDGE_DELTA_VERSION = 1;

/**
 * Compute first 8 bytes (hex) of SHA-256 of canonical graph JSON.
 * @param {object} gw — graph_weights object
 * @returns {string} 16-char hex
 */
function graphHash(gw) {
  const canonical = JSON.stringify({
    version: gw.version,
    discovered_cohort: gw.discovered_cohort,
    level: gw.level,
    edges: (gw.edges || []).slice().sort((a, b) => {
      const ka = (a.from || '') + '|' + (a.to || '');
      const kb = (b.from || '') + '|' + (b.to || '');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Build advertisement packet (Phase 1/4). Compact format for LoRa.
 * Format: AGNI-M1|<hubId6>|<graphHash16>|<edges4>|<ts8>
 * hubId truncated/hashed to 6 chars; edges as hex; ts as hex.
 * @param {string} hubId
 * @param {object} gw — graph_weights
 * @returns {string} packet string
 */
function buildAdvertisement(hubId, gw) {
  const h = (hubId || 'unknown').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 6).padEnd(6, '0');
  const hash = graphHash(gw || { edges: [] });
  const edges = Math.min(0xFFFF, (gw && gw.edges) ? gw.edges.length : 0);
  const ts = Math.floor(Date.now() / 1000);
  return AD_PREFIX + h + '|' + hash + '|' + edges.toString(16) + '|' + ts.toString(16);
}

/**
 * Parse advertisement packet.
 * @param {string} raw
 * @returns {{ hubId: string, graphHash: string, edgeCount: number, timestamp: number } | null}
 */
function parseAdvertisement(raw) {
  if (!raw || typeof raw !== 'string' || !raw.startsWith(AD_PREFIX)) return null;
  const rest = raw.slice(AD_PREFIX.length);
  const parts = rest.split('|');
  if (parts.length < 4) return null;
  const hubId = parts[0];
  const graphHashVal = parts[1];
  const edgeCount = parseInt(parts[2], 16) || 0;
  const timestamp = parseInt(parts[3], 16) || 0;
  return { hubId, graphHash: graphHashVal, edgeCount, timestamp };
}

/**
 * Convert full edge to compact format (f,t,w,c).
 */
function edgeToCompact(e) {
  return {
    f: e.from,
    t: e.to,
    w: typeof e.weight === 'number' ? e.weight : 1,
    c: typeof e.confidence === 'number' ? e.confidence : 0
  };
}

/**
 * Convert compact edge to full format.
 */
function compactToEdge(c) {
  if (!c || typeof c.f !== 'string' || typeof c.t !== 'string') return null;
  return {
    from: c.f,
    to: c.t,
    weight: typeof c.w === 'number' ? Math.max(0, Math.min(1, c.w)) : 1,
    confidence: typeof c.c === 'number' ? Math.max(0, Math.min(1, c.c)) : 0
  };
}

/**
 * Build edge-delta packet (Phase 5).
 * @param {string} hubId
 * @param {Array<{from:string,to:string,weight:number,confidence:number}>} edges
 * @returns {object} JSON-serializable
 */
function buildEdgeDelta(hubId, edges) {
  const compact = (edges || []).slice(0, 2).map(edgeToCompact).filter(Boolean);
  if (compact.length === 0) return null;
  return {
    v: EDGE_DELTA_VERSION,
    hubId: hubId || 'unknown',
    ts: Date.now(),
    edges: compact
  };
}

/**
 * Parse edge-delta packet.
 * @param {string|object} raw — JSON string or parsed object
 * @returns {{ hubId: string, ts: number, edges: Array } | null}
 */
function parseEdgeDelta(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || obj.v !== EDGE_DELTA_VERSION || !Array.isArray(obj.edges)) return null;
  const edges = obj.edges.map(compactToEdge).filter(Boolean);
  if (edges.length === 0) return null;
  return {
    hubId: obj.hubId || 'unknown',
    ts: typeof obj.ts === 'number' ? obj.ts : Date.now(),
    edges
  };
}

/**
 * Build chunked transfer packet (Phase 6).
 * @param {string} hubId
 * @param {string} transferId
 * @param {number} chunkIndex
 * @param {number} totalChunks
 * @param {string} payload — base64 or raw string chunk
 * @returns {object}
 */
function buildChunk(hubId, transferId, chunkIndex, totalChunks, payload) {
  return {
    v: 1,
    type: 'chunk',
    hubId: hubId || 'unknown',
    transferId,
    i: chunkIndex,
    n: totalChunks,
    p: payload
  };
}

/**
 * Parse chunk packet.
 */
function parseChunk(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || obj.type !== 'chunk' || typeof obj.i !== 'number' || typeof obj.n !== 'number') return null;
  return {
    hubId: obj.hubId || 'unknown',
    transferId: obj.transferId || '',
    chunkIndex: obj.i,
    totalChunks: obj.n,
    payload: obj.p || ''
  };
}

module.exports = {
  graphHash,
  buildAdvertisement,
  parseAdvertisement,
  buildEdgeDelta,
  parseEdgeDelta,
  buildChunk,
  parseChunk,
  edgeToCompact,
  compactToEdge,
  AD_PREFIX
};
