'use strict';

// Assembles the `ctx` object passed to route register() functions.
// Individual concerns live in packages/agni-hub/context/ â€” routes can gradually
// migrate to importing directly from those modules.

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createLogger }  = require('@agni/utils/logger');
const log = createLogger('theta');

const dataPaths  = require('./context/data-paths');
const config     = require('./context/config');
const services   = require('./context/services');
const dataAccess = require('./context/data-access');
const auth       = require('./context/auth');
const http       = require('./context/http');

// Bounded cache: clear entirely when size exceeds limit [R10 P2.3]
const THETA_CACHE_MAX = 500;
const _rawThetaCache = new Map();
const thetaCache = {
  get: function (k) { return _rawThetaCache.get(k); },
  set: function (k, v) {
    if (_rawThetaCache.size >= THETA_CACHE_MAX) _rawThetaCache.clear();
    _rawThetaCache.set(k, v);
    return this;
  },
  has: function (k) { return _rawThetaCache.has(k); },
  delete: function (k) { return _rawThetaCache.delete(k); },
  clear: function () { return _rawThetaCache.clear(); },
  get size() { return _rawThetaCache.size; }
};

module.exports = {
  fs, path, crypto,
  log,
  thetaCache,
  ...dataPaths,
  ...config,
  ...services,
  ...dataAccess,
  ...auth,
  ...http
};
