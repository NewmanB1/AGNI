'use strict';

/**
 * hub-transform/serve-assets.js
 * Response helpers (gzip, sendText, sendJson, sendFile) and asset path resolution.
 */

var fs   = require('fs');
var path = require('path');
var zlib = require('zlib');

var envConfig = require('@agni/utils/env-config');
var { resolveFactoryPath } = require('@agni/utils/runtimeManifest');

var constants = require('./constants');
var ALLOWED_FACTORY_FILES = constants.ALLOWED_FACTORY_FILES;
var ALLOWED_KATEX_FILES   = constants.ALLOWED_KATEX_FILES;
var MIME                  = constants.MIME;

var FACTORY_DIR = process.env.AGNI_FACTORY_DIR || require('@agni/runtime').RUNTIME_ROOT;
var KATEX_DIR   = process.env.AGNI_KATEX_DIR || path.join(__dirname, '../../../data/katex-css');

function gzip(buf, cb) {
  zlib.gzip(buf, cb);
}

/**
 * @param {object} [opts] Optional { retryAfter } for 202 responses
 */
function sendText(req, res, statusCode, contentType, body, opts) {
  var buf = Buffer.from(body, 'utf8');
  res.setHeader('Access-Control-Allow-Origin', envConfig.corsOrigin || 'null');
  res.setHeader('Content-Type', contentType);
  if (opts && typeof opts.retryAfter === 'number') {
    res.setHeader('Retry-After', String(opts.retryAfter));
  }
  if (contentType.indexOf('html') !== -1) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; worker-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  if (req.headers['accept-encoding'] &&
      req.headers['accept-encoding'].indexOf('gzip') !== -1 &&
      buf.length > 1024) {
    gzip(buf, function (err, compressed) {
      if (err) {
        res.writeHead(statusCode);
        res.end(buf);
      } else {
        res.setHeader('Content-Encoding', 'gzip');
        res.writeHead(statusCode);
        res.end(compressed);
      }
    });
  } else {
    res.writeHead(statusCode);
    res.end(buf);
  }
}

function sendJson(req, res, statusCode, payload) {
  sendText(req, res, statusCode, 'application/json; charset=utf-8',
    JSON.stringify(payload));
}

function sendFile(req, res, filePath, contentType, maxAge) {
  fs.readFile(filePath, function (err, buf) {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', envConfig.corsOrigin || 'null');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=' + (maxAge || 0));

    if (req.headers['accept-encoding'] &&
        req.headers['accept-encoding'].indexOf('gzip') !== -1 &&
        buf.length > 1024) {
      gzip(buf, function (gzipErr, compressed) {
        if (gzipErr) {
          res.writeHead(200);
          res.end(buf);
        } else {
          res.setHeader('Content-Encoding', 'gzip');
          res.writeHead(200);
          res.end(compressed);
        }
      });
    } else {
      res.writeHead(200);
      res.end(buf);
    }
  });
}

module.exports = {
  ALLOWED_FACTORY_FILES:  ALLOWED_FACTORY_FILES,
  ALLOWED_KATEX_FILES:    ALLOWED_KATEX_FILES,
  MIME:                   MIME,
  FACTORY_DIR:            FACTORY_DIR,
  KATEX_DIR:              KATEX_DIR,
  resolveFactoryPath:     resolveFactoryPath,
  sendText:               sendText,
  sendJson:               sendJson,
  sendFile:               sendFile
};
