'use strict';
// packages/agni-hub/mesh/index.js — Mesh daemon (R9 Phases 1–6)
// Broadcasts graph_weights advertisements and edge deltas; receives and merges from peers.
// Run via: node hub-tools/mesh.js [--transport=udp|stub] [--port=18471]

const path = require('path');
const fs = require('fs');

const { loadHubConfig } = require('@agni/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));
const { validateEnv } = require('@agni/utils/env-validate');
validateEnv();

const envConfig = require('@agni/utils/env-config');
const { ensureDataDirExists } = require('@agni/utils/ensure-paths');
ensureDataDirExists(envConfig);

const { createLogger } = require('@agni/utils/logger');
const { loadJSON, saveJSON } = require('@agni/utils/json-store');

const DATA_DIR = envConfig.dataDir;
const HUB_ID = envConfig.hubId;
const GRAPH_WEIGHTS_PATH = path.join(DATA_DIR, 'graph-weights.json');
const MESH_STATE_PATH = path.join(DATA_DIR, 'mesh-state.json');
const MESH_LOG = path.join(DATA_DIR, 'mesh.log');

const log = createLogger('mesh', { logFile: MESH_LOG });

const protocol = require('./protocol');
const transports = require('./transports');
const peerTable = require('./peer-table').createPeerTable({ log });
const { mergeEdgeDeltas } = require('./merge');
const { chunkGraphWeights, assembleChunks } = require('./chunked');

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, val] = a.slice(2).split('=');
      result[key] = val !== undefined ? val : true;
    }
  }
  return result;
}

function loadGraphWeights() {
  if (!fs.existsSync(GRAPH_WEIGHTS_PATH)) return null;
  try {
    return loadJSON(GRAPH_WEIGHTS_PATH, null);
  } catch {
    return null;
  }
}

function broadcastAdvertisement(transport) {
  const gw = loadGraphWeights();
  if (!gw || !Array.isArray(gw.edges) || gw.edges.length === 0) return;
  const ad = protocol.buildAdvertisement(HUB_ID, gw);
  transport.send(Buffer.from(ad, 'utf8'));
}

function broadcastEdgeDeltas(transport, maxEdges) {
  const gw = loadGraphWeights();
  if (!gw || !Array.isArray(gw.edges)) return;
  const edges = gw.edges.slice(-(maxEdges || 2));
  const pkt = protocol.buildEdgeDelta(HUB_ID, edges);
  if (pkt) transport.send(Buffer.from(JSON.stringify(pkt), 'utf8'));
}

const chunkBuffers = new Map();

function handleReceived(transport, buf) {
  const str = buf.toString('utf8');
  if (str.startsWith(protocol.AD_PREFIX)) {
    const ad = protocol.parseAdvertisement(str);
    if (ad && peerTable.add(ad)) {
      log.info('mesh:advertisement received', { hubId: ad.hubId, edges: ad.edgeCount });
    }
    return;
  }
  if (str.startsWith('{"v":1,')) {
    const delta = protocol.parseEdgeDelta(str);
    if (delta) {
      mergeEdgeDeltas(DATA_DIR, delta.edges, delta.hubId, log);
    }
    return;
  }
  const chunk = protocol.parseChunk(str);
  if (chunk) {
    const key = chunk.hubId + ':' + chunk.transferId;
    if (!chunkBuffers.has(key)) chunkBuffers.set(key, new Map());
    chunkBuffers.get(key).set(chunk.chunkIndex, chunk.payload);
    if (chunk.chunkIndex === chunk.totalChunks - 1) {
      const all = chunkBuffers.get(key);
      const full = [];
      for (let i = 0; i < chunk.totalChunks; i++) {
        full.push(all.get(i));
      }
      if (full.every(Boolean)) {
        try {
          const json = full.map(function (p) { return Buffer.from(p, 'base64').toString('utf8'); }).join('');
          const gw = JSON.parse(json);
          if (gw.level && gw.level !== 'village' && Array.isArray(gw.edges)) {
            const meshPath = path.join(DATA_DIR, 'graph-weights-mesh.json');
            saveJSON(meshPath, gw);
            log.info('mesh:chunked graph received', { hubId: chunk.hubId, edges: gw.edges.length });
          }
        } catch (_) { /* ignore */ }
      }
      chunkBuffers.delete(key);
    }
  }
}

function runMesh(args) {
  const transportType = args.transport || process.env.AGNI_MESH_TRANSPORT || 'udp';
  const port = parseInt(args.port || process.env.AGNI_MESH_PORT || '18471', 10);

  const transportOpts = { port, log };
  if (transportType === 'lora') {
    if (process.env.AGNI_LORA_SPI_BUS !== undefined) transportOpts.spiBus = parseInt(process.env.AGNI_LORA_SPI_BUS, 10);
    if (process.env.AGNI_LORA_SPI_DEVICE !== undefined) transportOpts.spiDevice = parseInt(process.env.AGNI_LORA_SPI_DEVICE, 10);
    if (process.env.AGNI_LORA_RESET_PIN !== undefined) transportOpts.resetPin = parseInt(process.env.AGNI_LORA_RESET_PIN, 10);
    if (process.env.AGNI_LORA_DIO0_PIN !== undefined) transportOpts.dio0Pin = parseInt(process.env.AGNI_LORA_DIO0_PIN, 10);
    if (process.env.AGNI_LORA_FREQUENCY !== undefined) transportOpts.frequency = parseInt(process.env.AGNI_LORA_FREQUENCY, 10);
  }
  const transport = transports.createTransport(transportType, transportOpts);

  transport.onReceive(function (buf) {
    handleReceived(transport, buf);
  });

  transport.start();

  const adInterval = setInterval(function () {
    broadcastAdvertisement(transport);
  }, 60000);

  const edgeInterval = setInterval(function () {
    broadcastEdgeDeltas(transport, 2);
  }, 120000);

  function stop() {
    clearInterval(adInterval);
    clearInterval(edgeInterval);
    transport.stop();
    log.info('mesh stopped');
  }

  broadcastAdvertisement(transport);

  return { stop };
}

let meshInstance = null;

function start(args) {
  if (meshInstance) return meshInstance;
  meshInstance = runMesh(args || {});
  return meshInstance;
}

function stop() {
  if (meshInstance) {
    meshInstance.stop();
    meshInstance = null;
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  log.info('mesh starting', { transport: args.transport || 'udp', hubId: HUB_ID });
  const m = start(args);
  process.on('SIGINT', function () { m.stop(); process.exit(0); });
  process.on('SIGTERM', function () { m.stop(); process.exit(0); });
}

module.exports = {
  start,
  stop,
  runMesh,
  loadGraphWeights,
  broadcastAdvertisement,
  broadcastEdgeDeltas
};
