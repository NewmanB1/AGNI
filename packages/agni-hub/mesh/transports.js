'use strict';
// packages/agni-hub/mesh/transports.js — Transport interface and implementations (R9 Phase 1/3)
// LoRa HAL: UDP simulation for development; real LoRa hardware would implement same interface.
// See docs/playbooks/mesh-lora.md.

const dgram = require('dgram');

/**
 * Transport interface: { send(payload: Buffer|string), onReceive(cb: (buf) => void), start(), stop() }
 */

/**
 * Stub LoRa transport (Phase 1) — logs only, no actual I/O.
 */
function createStubTransport(opts) {
  const log = (opts && opts.log) || (function () {});
  return {
    send: function (payload) {
      log.info('mesh:stub send', { len: (payload && payload.length) || 0 });
    },
    onReceive: function (cb) {
      log.info('mesh:stub onReceive registered (no packets will arrive)');
    },
    start: function () {
      log.info('mesh:stub start');
    },
    stop: function () {
      log.info('mesh:stub stop');
    }
  };
}

/**
 * UDP-based simulated LoRa (Phase 2/3).
 * Multicast or broadcast on localhost/LAN for mesh simulation.
 * Replace with real SX1276/SX1262 HAL when hardware is available.
 */
function createUdpTransport(opts) {
  const port = (opts && opts.port) || 18471; // AGNI mesh default
  const broadcastAddr = (opts && opts.broadcastAddr) || '127.255.255.255';
  const log = (opts && opts.log) || (function () {});
  let sock = null;
  let receiveCb = null;

  function send(payload) {
    if (!sock) return;
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    sock.send(buf, 0, buf.length, port, broadcastAddr, function (err) {
      if (err) log.warn('mesh:udp send failed', { error: err.message });
    });
  }

  function onReceive(cb) {
    receiveCb = cb;
  }

  function start() {
    if (sock) return;
    sock = dgram.createSocket('udp4');
    sock.on('message', function (msg) {
      if (receiveCb) receiveCb(msg);
    });
    sock.on('error', function (err) {
      log.warn('mesh:udp error', { error: err.message });
    });
    sock.bind(port, function () {
      try {
        sock.setBroadcast(true);
      } catch (e) {
        log.warn('mesh:udp setBroadcast failed (some platforms)', { error: e.message });
      }
      log.info('mesh:udp listening', { port });
    });
  }

  function stop() {
    if (sock) {
      sock.close();
      sock = null;
    }
  }

  return {
    send,
    onReceive,
    start,
    stop,
    _sock: function () { return sock; }
  };
}

/**
 * LoRa HAL transport (SX1276/77/78/79). Uses sx127x-driver when installed.
 * Falls back to stub with log message if HAL unavailable.
 */
function createLoraTransport(opts) {
  var loraHal = null;
  try {
    loraHal = require('./lora-hal');
  } catch (e) {
    /* lora-hal always exists; ignore */
  }
  var log = (opts && opts.log) || (function () {});
  if (loraHal && loraHal.isAvailable()) {
    var t = loraHal.createSx1276Transport(opts);
    if (t) return t;
  }
  log.warn('mesh:lora HAL unavailable (sx127x-driver not installed or platform unsupported). Install: npm install sx127x-driver. Falling back to stub.');
  return createStubTransport(opts);
}

/**
 * Create transport by type.
 * @param {'stub'|'udp'|'lora'} type
 * @param {object} opts
 * @returns {object} transport
 */
function createTransport(type, opts) {
  if (type === 'stub') return createStubTransport(opts);
  if (type === 'udp') return createUdpTransport(opts);
  if (type === 'lora') return createLoraTransport(opts);
  return createStubTransport(opts);
}

module.exports = {
  createStubTransport,
  createUdpTransport,
  createLoraTransport,
  createTransport
};
