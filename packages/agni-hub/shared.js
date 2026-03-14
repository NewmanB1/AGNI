'use strict';

// Assembles the `ctx` object passed to route register() functions.
// Individual concerns live in packages/agni-hub/context/ â€” routes can gradually
// migrate to importing directly from those modules.

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createLogger }  = require('@agni/utils/logger');
const log = createLogger('pathfinder');

const dataPaths  = require('./context/data-paths');
const config     = require('./context/config');
const services   = require('./context/services');
const dataAccess = require('./context/data-access');
const auth       = require('./context/auth');
const http       = require('./context/http');

// Bounded cache: clear entirely when size exceeds limit [R10 P2.3]
const PATHFINDER_CACHE_MAX = 500;
const _rawPathfinderCache = new Map();
const pathfinderCache = {
  get: function (k) { return _rawPathfinderCache.get(k); },
  set: function (k, v) {
    if (_rawPathfinderCache.size >= PATHFINDER_CACHE_MAX) _rawPathfinderCache.clear();
    _rawPathfinderCache.set(k, v);
    return this;
  },
  has: function (k) { return _rawPathfinderCache.has(k); },
  delete: function (k) { return _rawPathfinderCache.delete(k); },
  clear: function () { return _rawPathfinderCache.clear(); },
  get size() { return _rawPathfinderCache.size; }
};

module.exports = {
  fs, path, crypto,
  log,
  pathfinderCache,
  ...dataPaths,
  ...config,
  ...services,
  ...dataAccess,
  ...auth,
  ...http
};
