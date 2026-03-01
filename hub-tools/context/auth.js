'use strict';

const crypto = require('crypto');
const { extractBearerToken, checkAuthRateLimit } = require('../../src/utils/http-helpers');
const { accountsService } = require('./services');

async function _authenticate(req, qs, sendResponse) {
  const token = extractBearerToken(req, qs);
  const creator = await accountsService.validateSession(token);
  if (!creator) {
    sendResponse(401, { error: 'Authentication required' });
    return null;
  }
  return creator;
}

async function requireAdmin(req, qs, sendResponse) {
  const creator = await _authenticate(req, qs, sendResponse);
  if (!creator) return null;
  if (creator.role !== 'admin') {
    sendResponse(403, { error: 'Admin privileges required' });
    return null;
  }
  return creator;
}

async function requireAuth(req, qs, sendResponse) {
  return _authenticate(req, qs, sendResponse);
}

function requireRole(allowedRoles) {
  return async function (req, qs, sendResponse) {
    const creator = await _authenticate(req, qs, sendResponse);
    if (!creator) return null;
    if (allowedRoles.indexOf(creator.role) === -1) {
      sendResponse(403, { error: 'Insufficient privileges' });
      return null;
    }
    return creator;
  };
}

function adminOnly(handler) {
  return async (req, res, opts) => {
    const creator = await requireAdmin(req, opts.qs, opts.sendResponse);
    if (!creator) return;
    return handler(req, res, { ...opts, creator });
  };
}

function authOnly(handler) {
  return async (req, res, opts) => {
    const creator = await requireAuth(req, opts.qs, opts.sendResponse);
    if (!creator) return;
    return handler(req, res, { ...opts, creator });
  };
}

function roleOnly(allowedRoles, handler) {
  const check = requireRole(allowedRoles);
  return async (req, res, opts) => {
    const creator = await check(req, opts.qs, opts.sendResponse);
    if (!creator) return;
    return handler(req, res, { ...opts, creator });
  };
}

function requireHubKey(handler) {
  const hubKey = process.env.AGNI_HUB_API_KEY || '';
  return (req, res, opts) => {
    if (!hubKey) return handler(req, res, opts);
    const provided = req.headers['x-hub-key'] || (opts.qs && opts.qs.hubKey) || '';
    if (provided !== hubKey) {
      return opts.sendResponse(401, { error: 'Invalid or missing hub API key' });
    }
    return handler(req, res, opts);
  };
}

function requireLms(handler) {
  const { lmsService } = require('./services');
  return (req, res, opts) => {
    if (!lmsService.isAvailable || !lmsService.isAvailable()) {
      return opts.sendResponse(503, { error: 'LMS engine not available' });
    }
    return handler(req, res, opts);
  };
}

function withRateLimit(keyPrefix, handler) {
  return (req, res, opts) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (checkAuthRateLimit(keyPrefix + ':' + clientIp, opts.sendResponse)) return;
    return handler(req, res, opts);
  };
}

function requireParam(qs, name, sendResponse) {
  if (!qs[name]) {
    sendResponse(400, { error: name + ' required' });
    return null;
  }
  return qs[name];
}

function generateGroupId() {
  return 'group-' + Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex');
}

function generateInviteCode() {
  return accountsService.generateCode(6);
}

module.exports = {
  requireAdmin, requireAuth, requireRole, adminOnly, authOnly, roleOnly,
  requireHubKey, requireLms, withRateLimit, requireParam,
  generateGroupId, generateInviteCode
};
