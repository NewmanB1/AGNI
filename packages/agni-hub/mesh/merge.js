'use strict';
// packages/agni-hub/mesh/merge.js — Merge edge deltas into graph-weights-mesh (R9 Phase 5)
// Same sanitization as sync.js importInbound. Writes to data/graph-weights-mesh.json.

const path = require('path');
const { saveJSON, loadJSON } = require('@agni/utils/json-store');

function sanitizeEdge(e) {
  if (!e || typeof e.from !== 'string' || typeof e.to !== 'string' || e.from === e.to) return null;
  const w = typeof e.weight === 'number' ? Math.max(0, Math.min(1, e.weight)) : 1;
  const c = typeof e.confidence === 'number' ? Math.max(0, Math.min(1, e.confidence)) : 0;
  return { from: e.from, to: e.to, weight: w, confidence: c };
}

/**
 * Merge edge deltas into existing graph-weights-mesh.
 * Uses (from,to) as key; newer wins. Adds sample_size from schema default.
 */
function mergeEdgeDeltas(dataDir, edges, sourceHubId, log) {
  const meshPath = path.join(dataDir, 'graph-weights-mesh.json');
  let existing = { edges: [], level: 'mesh', sample_size: 20 };
  try {
    existing = loadJSON(meshPath, existing);
  } catch { /* use default */ }
  if (!Array.isArray(existing.edges)) existing.edges = [];

  const byKey = new Map();
  existing.edges.forEach(function (e) {
    const k = e.from + '|' + e.to;
    byKey.set(k, e);
  });

  let added = 0;
  (edges || []).forEach(function (e) {
    const s = sanitizeEdge(e);
    if (!s) return;
    const k = s.from + '|' + s.to;
    if (!byKey.has(k)) {
      byKey.set(k, { ...s, sample_size: 20 });
      added++;
    }
  });

  const merged = {
    version: existing.version || '1.0',
    discovered_cohort: existing.discovered_cohort || 'c_mesh',
    level: 'mesh',
    sample_size: Math.max(20, existing.sample_size || 20),
    created_date: existing.created_date || new Date().toISOString(),
    last_updated: new Date().toISOString(),
    weight_estimation_method: 'mesh_merge',
    clustering_method: 'mesh',
    default_weight: 1,
    edges: [...byKey.values()]
  };

  saveJSON(meshPath, merged);
  if (log && added > 0) {
    log.info('mesh:merge edge deltas', { added, total: merged.edges.length, sourceHubId });
  }
  return merged;
}

module.exports = { mergeEdgeDeltas, sanitizeEdge };
