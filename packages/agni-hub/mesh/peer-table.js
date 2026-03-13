'use strict';
// packages/agni-hub/mesh/peer-table.js — Mesh peer state (R9 Phase 4)
// Tracks advertised peers; rejects stale/duplicate advertisements.

const STALE_SECONDS = 3600; // 1 hour
const MAX_PEERS = 50;

function createPeerTable(opts) {
  const log = (opts && opts.log) || (function () {});
  const peers = new Map(); // hubId -> { hubId, graphHash, edgeCount, timestamp, seenAt }

  function add(ad) {
    if (!ad || !ad.hubId) return false;
    const now = Math.floor(Date.now() / 1000);
    if (ad.timestamp && (now - ad.timestamp) > STALE_SECONDS) {
      log.debug('mesh:peer stale advertisement rejected', { hubId: ad.hubId });
      return false;
    }
    const existing = peers.get(ad.hubId);
    if (existing && existing.graphHash === ad.graphHash && existing.timestamp === ad.timestamp) {
      return false; // duplicate
    }
    const entry = {
      hubId: ad.hubId,
      graphHash: ad.graphHash,
      edgeCount: ad.edgeCount || 0,
      timestamp: ad.timestamp || now,
      seenAt: Date.now()
    };
    peers.set(ad.hubId, entry);
    while (peers.size > MAX_PEERS) {
      const oldest = [...peers.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt)[0];
      if (oldest) peers.delete(oldest[0]);
    }
    return true;
  }

  function getPeers() {
    const now = Date.now();
    const stale = STALE_SECONDS * 1000;
    for (const [id, p] of peers.entries()) {
      if (now - p.seenAt > stale) peers.delete(id);
    }
    return [...peers.values()];
  }

  function clear() {
    peers.clear();
  }

  return {
    add,
    getPeers,
    clear
  };
}

module.exports = { createPeerTable };
