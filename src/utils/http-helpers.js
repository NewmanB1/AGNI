'use strict';

/**
 * HTTP helper utilities shared across hub-tools servers.
 * Provides body parsing with size limits, auth extraction, and safe error responses.
 */

const zlib = require('zlib');
const { createRateLimiter } = require('./rate-limiter');

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
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
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
  readBody(req).then(body => {
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch (err) {
      sendResponse(400, { error: 'Invalid JSON' });
      return;
    }
    return Promise.resolve(handler(payload)).catch(err => {
      sendResponse(500, { error: 'Internal server error' });
    });
  }).catch(err => {
    if (err.message === 'Request body too large') {
      sendResponse(413, { error: 'Request body too large' });
    } else {
      sendResponse(500, { error: 'Internal server error' });
    }
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
  let _defaultCors;
  try { _defaultCors = require('./env-config').corsOrigin; } catch (_) { _defaultCors = 'null'; }
  const corsOrigin = (opts && opts.corsOrigin) || _defaultCors;
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
  };
}

/**
 * Extract Bearer token from Authorization header or query param.
 * @param {import('http').IncomingMessage} req
 * @param {Record<string, string>} qs
 * @returns {string|null}
 */
function extractBearerToken(req, qs) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return (qs && qs.token) || null;
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
  return 'req-' + Date.now().toString(36) + '-' + require('crypto').randomBytes(4).toString('hex');
}

module.exports = {
  readBody,
  handleJsonBody,
  createResponseSender,
  extractBearerToken,
  safeErrorMessage,
  checkAuthRateLimit,
  generateRequestId
};
