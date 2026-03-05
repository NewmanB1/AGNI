'use strict';

// LMS engine service wrapper.
// Provides a small, top-down API around @agni/engine so that
// callers (theta, future HTTP handlers, tools) do not need to know
// the engine's internal file layout.
//
// Uses a Proxy to delegate all engine method calls without maintaining
// a manual list of pass-through wrappers. Only `isAvailable` and
// `persistState` carry custom logic; everything else forwards directly
// to the loaded engine module.

const { createLogger } = require('@agni/utils/logger');
const log = createLogger('lms-service');

let engine = null;

try {
  engine = require('@agni/engine');
  log.info('Engine module loaded (state deferred until first use)');
} catch (err) {
  log.warn('Engine not available — degraded mode: theta scheduling active, bandit selection disabled', { error: err.message });
}

function isAvailable() {
  return !!engine;
}

function requireEngine() {
  if (!engine) {
    throw new Error('LMS engine not available');
  }
  return engine;
}

function persistState() {
  const eng = requireEngine();
  if (typeof eng.persistState === 'function') return eng.persistState();
  if (typeof eng.reloadState === 'function') return eng.reloadState();
  throw new Error('Engine does not expose a state persistence method');
}

module.exports = new Proxy({}, {
  get(_, prop) {
    if (prop === 'isAvailable') return isAvailable;
    if (prop === 'persistState') return persistState;
    return requireEngine()[prop];
  }
});
