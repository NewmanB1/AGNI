'use strict';

/**
 * HTTP helper utilities shared across hub-tools servers.
 * Provides body parsing with size limits, auth extraction, and safe error responses.
 */

const zlib = require('zlib');
const crypto = require('crypto');
const { createRateLimiter } = require('./rate-limiter');
const envConfig = require('./env-config');

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB default

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 });

/**
 * Read request body with size limit.
 * @param {import('http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<string>}
 */
function readBody(req, opts) {
  const maxBytes = (opts && opts.maxBytes) || MAX_BODY_SIZE;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Parse JSON body and pass to handler. Returns errors as HTTP responses.
 * @param {import('http').IncomingMessage} req
 * @param {Function} sendResponse
 * @param {Function} handler  (payload) => void
 */
function handleJsonBody(req, sendResponse, handler) {
  return readBody(req).then(body => {
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch (err) {
      sendResponse(400, { error: 'Invalid JSON' });
      return Promise.resolve();
    }
    return Promise.resolve(handler(payload)).catch(err => {
      sendResponse(500, { error: 'Internal server error' });
      return undefined;
    });
  }).catch(err => {
    if (err.message === 'Request body too large') {
      sendResponse(413, { error: 'Request body too large' });
    } else {
      sendResponse(500, { error: 'Internal server error' });
    }
    return undefined;
  });
}

/**
 * Create a JSON response sender with gzip support and security headers.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ corsOrigin?: string, requestId?: string }} [opts]
 * @returns {Function} sendResponse(statusCode, payload)
 */
function createResponseSender(req, res, opts) {
  const corsOrigin = (opts && opts.corsOrigin) || envConfig.corsOrigin;
  const requestId = (opts && opts.requestId) || null;

  return function sendResponse(statusCode, payload) {
    const jsonStr = JSON.stringify(payload);
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (requestId) res.setHeader('X-Request-Id', requestId);

    if (req.headers['accept-encoding'] &&
        req.headers['accept-encoding'].includes('gzip') &&
        jsonStr.length > 1000) {
      res.setHeader('Content-Encoding', 'gzip');
      zlib.gzip(Buffer.from(jsonStr), (err, compressed) => {
        if (err) {
          res.removeHeader('Content-Encoding');
          res.writeHead(statusCode);
          res.end(jsonStr);
          return;
        }
        res.writeHead(statusCode);
        res.end(compressed);
      });
    } else {
      res.writeHead(statusCode);
      res.end(jsonStr);
    }
    return undefined;
  };
}

/**
 * Extract Bearer token from Authorization header or query param.
 * @param {import('http').IncomingMessage} req
 * @param {Record<string, string>} _qs  unused; reserved for future query-param token lookup
 * @returns {string|null}
 */
function extractBearerToken(req, _qs) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

/**
 * Extract User-Agent from request. Used for device fingerprint binding (P2-13).
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function getClientUserAgent(req) {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : '';
}

/**
 * Extract client IP from request (x-forwarded-for or socket).
 * Used for session binding to mitigate token theft.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  try {
    return req.socket && req.socket.remoteAddress || '0.0.0.0';
  } catch (e) {
    return '0.0.0.0';
  }
}

/**
 * Extract student session token from Cookie or Authorization header.
 * Used by lesson delivery to bind compiled content to authenticated identity.
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
function extractStudentSessionToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/\bagni_student_session=([^\s;]+)/);
  return match ? match[1] : null;
}

/**
 * Sanitize an error for external display (strip file paths and stack traces).
 * @param {Error|string} err
 * @returns {string}
 */
function safeErrorMessage(err) {
  const msg = typeof err === 'string' ? err : (err && err.message) || 'Unknown error';
  if (msg.includes('/') || msg.includes('\\') || msg.includes('ENOENT') || msg.includes('EACCES')) {
    return 'Internal server error';
  }
  return msg;
}

/**
 * Check rate limit for auth endpoints.
 * @param {string} key  IP or identifier
 * @param {Function} sendResponse
 * @returns {boolean} true if request should be blocked
 */
function checkAuthRateLimit(key, sendResponse) {
  const result = authLimiter.check(key);
  if (!result.allowed) {
    sendResponse(429, {
      error: 'Too many requests. Try again later.',
      retryAfterMs: result.resetMs
    });
    return true;
  }
  return false;
}

/**
 * Generate a short request ID for tracing.
 * @returns {string}
 */
function generateRequestId() {
  return 'req-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

module.exports = {
  readBody,
  handleJsonBody,
  createResponseSender,
  extractBearerToken,
  extractStudentSessionToken,
  getClientIp,
  getClientUserAgent,
  safeErrorMessage,
  checkAuthRateLimit,
  generateRequestId
};
