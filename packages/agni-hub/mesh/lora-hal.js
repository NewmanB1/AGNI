'use strict';
// packages/agni-hub/mesh/lora-hal.js — Hardware abstraction for SX1276/SX1262 LoRa radios (R9)
// Wraps sx127x-driver when available. Requires: Linux, SPI enabled, sx127x-driver installed.
// Run: npm install sx127x-driver (optional; mesh works with stub/udp without it)
// See docs/playbooks/mesh-lora.md §7.

/**
 * Transport interface contract (same as transports.js):
 *   { send(payload: Buffer), onReceive(cb: (buf) => void), start(), stop() }
 */

/**
 * Create LoRa HAL transport using SX1276/77/78/79 hardware.
 * Requires: sx127x-driver, Linux, SPI (e.g. Raspberry Pi with LoRa HAT).
 * @param {object} opts
 * @param {number} [opts.spiBus=0]
 * @param {number} [opts.spiDevice=0]
 * @param {number} [opts.resetPin=24]
 * @param {number} [opts.dio0Pin=25]
 * @param {number} [opts.frequency=868e6]
 * @param {number} [opts.spreadingFactor=7]
 * @param {number} [opts.signalBandwidth=125e3]
 * @param {object} [opts.log]
 * @returns {object} transport or null if HAL unavailable
 */
function createSx1276Transport(opts) {
  let SX127x;
  try {
    // @ts-expect-error optional dep; sx127x-driver not installed by default
    SX127x = require('sx127x-driver');
  } catch {
    return null;
  }

  const log = (opts && opts.log) || function () {};
  let sx127x = null;
  let receiveCb = null;

  const driverOpts = {
    spiBus: (opts && opts.spiBus) !== undefined ? opts.spiBus : 0,
    spiDevice: (opts && opts.spiDevice) !== undefined ? opts.spiDevice : 0,
    resetPin: (opts && opts.resetPin) !== undefined ? opts.resetPin : 24,
    dio0Pin: (opts && opts.dio0Pin) !== undefined ? opts.dio0Pin : 25,
    frequency: (opts && opts.frequency) !== undefined ? opts.frequency : 868e6,
    spreadingFactor: (opts && opts.spreadingFactor) !== undefined ? opts.spreadingFactor : 7,
    signalBandwidth: (opts && opts.signalBandwidth) !== undefined ? opts.signalBandwidth : 125e3
  };

  function send(payload) {
    if (!sx127x) return;
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    sx127x.write(buf).then(function () {
      log.info('mesh:lora sent', { len: buf.length });
    }).catch(function (err) {
      log.warn('mesh:lora send failed', { error: err.message });
    });
  }

  function onReceive(cb) {
    receiveCb = cb;
  }

  function start() {
    if (sx127x) return;
    sx127x = new SX127x(driverOpts);
    sx127x.open()
      .then(function () {
        return sx127x.setContinuousReceiveMode();
      })
      .then(function () {
        sx127x.on('data', function (data, _rssi, _snr) {
          if (receiveCb && data) receiveCb(Buffer.isBuffer(data) ? data : Buffer.from(data));
        });
        log.info('mesh:lora started', { frequency: driverOpts.frequency });
      })
      .catch(function (err) {
        log.error('mesh:lora open failed', { error: err.message });
        sx127x = null;
      });
  }

  function stop() {
    if (!sx127x) return;
    sx127x.close().then(function () {
      log.info('mesh:lora stopped');
    }).catch(function (err) {
      log.warn('mesh:lora close failed', { error: err.message });
    });
    sx127x = null;
  }

  return {
    send: send,
    onReceive: onReceive,
    start: start,
    stop: stop
  };
}

/**
 * Check if LoRa HAL is available (sx127x-driver installed and loadable).
 */
function isAvailable() {
  try {
    require.resolve('sx127x-driver');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  createSx1276Transport,
  isAvailable
};
