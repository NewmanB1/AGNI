'use strict';

const crypto = require('crypto');
const { extractBearerToken, checkAuthRateLimit } = require('../../src/utils/http-helpers');
const { accountsService } = require('./services');

async function requireAdmin(req, qs, sendResponse) {
  const token = extractBearerToken(req, qs);
  const creator = await accountsService.validateSession(token);
  if (!creator) {
    sendResponse(401, { error: 'Authentication required' });
    return null;
  }
  if (!creator.approved && creator.role !== 'admin') {
    sendResponse(403, { error: 'Admin privileges required' });
    return null;
  }
  return creator;
}

function adminOnly(handler) {
  return async (req, res, opts) => {
    const creator = await requireAdmin(req, opts.qs, opts.sendResponse);
    if (!creator) return;
    return handler(req, res, { ...opts, creator });
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
  requireAdmin, adminOnly, requireLms, withRateLimit, requireParam,
  generateGroupId, generateInviteCode
};
