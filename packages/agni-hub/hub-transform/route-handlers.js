'use strict';

/**
 * hub-transform/route-handlers.js
 * HTTP request routing and handling: /lessons/, /factories/, /katex/, PWA assets, etc.
 */

var fs   = require('fs');
var path = require('path');
var querystring = require('querystring');

var { extractStudentSessionToken, getClientIp } = require('@agni/utils/http-helpers');
var accountsService = require('@agni/services/accounts');

var compile   = require('./compile');
var assemble  = require('./assemble');
var serveAssets = require('./serve-assets');

var createLogger = require('@agni/utils/logger').createLogger;
var log = createLogger('hub-transform');

var PKG_VERSION = require('../../../package.json').version || '0.0.0';
var SHELL_PLACEHOLDER = '<script src="/lesson-data.js"></script>';
var _shellTemplate = null;

var sendText  = serveAssets.sendText;
var sendJson  = serveAssets.sendJson;
var sendFile  = serveAssets.sendFile;
var MIME      = serveAssets.MIME;
var ALLOWED_FACTORY_FILES = serveAssets.ALLOWED_FACTORY_FILES;
var ALLOWED_KATEX_FILES   = serveAssets.ALLOWED_KATEX_FILES;
var FACTORY_DIR = serveAssets.FACTORY_DIR;
var KATEX_DIR   = serveAssets.KATEX_DIR;
var resolveFactoryPath = serveAssets.resolveFactoryPath;
var escapeHtml = assemble.escapeHtml;

/**
 * Resolve per-request compile options from student session.
 */
function getRequestCompileOptions(req, baseOptions) {
  var base = baseOptions || {};
  var token = extractStudentSessionToken(req);
  if (!token) return Promise.resolve(base);
  return accountsService.validateStudentSession(token, { clientIp: getClientIp(req) }).then(function (session) {
    if (!session || !session.pseudoId) return base;
    return Object.assign({}, base, { deviceId: session.pseudoId });
  }).catch(function () { return base; });
}

/**
 * Handle an incoming request for lesson delivery or factory assets.
 * Returns true if handled, false to fall through to theta.js routes.
 */
function handleRequest(req, res, options) {
  var urlPath = req.url.split('?')[0];

  // GET /shell/:slug
  var shellMatch = urlPath.match(/^\/shell\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && shellMatch) {
    var shellSlug = shellMatch[1];
    try {
      if (_shellTemplate === null) {
        _shellTemplate = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'shell.html'), 'utf8');
        if (_shellTemplate.indexOf(SHELL_PLACEHOLDER) === -1) {
          throw new Error('shell.html is missing the lesson-data.js placeholder script tag');
        }
      }
      var shellHtml = _shellTemplate.replace(
        SHELL_PLACEHOLDER,
        '<script src="/lesson-data.js?slug=' + encodeURIComponent(shellSlug) + '"></script>'
      );
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      sendText(req, res, 200, 'text/html; charset=utf-8', shellHtml);
    } catch (err) {
      sendText(req, res, 500, 'text/html; charset=utf-8',
        '<h1>Shell error</h1><pre>' + escapeHtml(err.message) + '</pre>');
    }
    return true;
  }

  // GET /library
  if (req.method === 'GET' && urlPath === '/library') {
    try {
      var libPath = path.join(__dirname, '..', 'pwa', 'library.html');
      sendFile(req, res, libPath, MIME['.html'], 3600);
    } catch (err) {
      sendText(req, res, 500, 'text/html; charset=utf-8', '<h1>Library error</h1>');
    }
    return true;
  }

  // GET /library.js
  if (req.method === 'GET' && urlPath === '/library.js') {
    var runtimeRoot = require('@agni/runtime').RUNTIME_ROOT;
    var libJsPath = path.join(runtimeRoot, 'shell', 'library.js');
    sendFile(req, res, libJsPath, MIME['.js'], 3600);
    return true;
  }

  // GET /lessons/:slug/sidecar
  var sidecarMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)\/sidecar$/);
  if (req.method === 'GET' && sidecarMatch) {
    var sidecarSlug = sidecarMatch[1];
    getRequestCompileOptions(req, options || {}).then(function (opts) {
      return compile.compileLesson(sidecarSlug, opts);
    }).then(function (result) {
      if (!result) return sendJson(req, res, 404, { error: 'Lesson not found' });
      sendJson(req, res, 200, result.sidecar);
    }).catch(function (err) {
      if (err && err.code === 'QUEUED' && typeof err.retryAfter === 'number') {
        res.setHeader('Retry-After', String(err.retryAfter));
        sendJson(req, res, 202, { queued: true, retryAfter: err.retryAfter });
        return;
      }
      sendJson(req, res, 500, { error: err.message });
    });
    return true;
  }

  // GET /lessons/:slug
  var lessonMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)$/);
  if (req.method === 'GET' && lessonMatch) {
    var slug = lessonMatch[1];
    getRequestCompileOptions(req, options || {}).then(function (opts) {
      return compile.compileLesson(slug, opts).then(function (result) {
        if (!result) {
          sendText(req, res, 404, 'text/html; charset=utf-8',
            '<h1>Lesson not found</h1><p>No YAML source found for: ' +
            escapeHtml(slug) + '</p>');
          return;
        }
        var html = assemble.assembleHtml(result.ir, opts);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        sendText(req, res, 200, 'text/html; charset=utf-8', html);
      });
    }).catch(function (err) {
      if (err && err.code === 'QUEUED' && typeof err.retryAfter === 'number') {
        var retrySec = err.retryAfter;
        var lessonUrl = '/lessons/' + encodeURIComponent(slug);
        var body202 = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="' + retrySec + ';url=' + escapeHtml(lessonUrl) + '"><title>Please wait</title></head><body><p>Server busy. Retrying in ' + retrySec + ' seconds\u2026</p><p><a href="' + lessonUrl + '">Click here if not redirected</a></p></body></html>';
        sendText(req, res, 202, 'text/html; charset=utf-8', body202, { retryAfter: retrySec });
        log.info('Compile queue full — 202 retry', { slug: slug, retryAfter: retrySec });
        return;
      }
      log.error('Compile error', { slug: slug, error: err.message });
      sendText(req, res, 500, 'text/html; charset=utf-8',
        '<h1>Compilation error</h1><pre>' + escapeHtml(err.message) + '</pre>');
    });
    return true;
  }

  // GET /factories/:file
  var factoryMatch = urlPath.match(/^\/factories\/(.+)$/);
  if (req.method === 'GET' && factoryMatch) {
    var factoryFile = path.basename(factoryMatch[1]);
    if (!ALLOWED_FACTORY_FILES.has(factoryFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    var factoryPath = resolveFactoryPath(FACTORY_DIR, factoryFile);
    sendFile(req, res, factoryPath, MIME['.js'], 604800);
    return true;
  }

  // GET /katex/:file
  var katexMatch = urlPath.match(/^\/katex\/(.+)$/);
  if (req.method === 'GET' && katexMatch) {
    var katexFile = path.basename(katexMatch[1]);
    if (!ALLOWED_KATEX_FILES.has(katexFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    var katexPath = path.join(KATEX_DIR, katexFile);
    sendFile(req, res, katexPath, MIME['.css'], 2592000);
    return true;
  }

  // GET /manifest.json
  if (req.method === 'GET' && urlPath === '/manifest.json') {
    var manifestPath = path.join(__dirname, '..', 'manifest.json');
    sendFile(req, res, manifestPath, MIME['.json'], 86400);
    return true;
  }

  // GET /sw.js
  if (req.method === 'GET' && urlPath === '/sw.js') {
    var swPath = path.join(__dirname, '..', 'sw.js');
    try {
      var raw = fs.readFileSync(swPath, 'utf8');
      var stamped = raw.replace('__SW_VERSION__', PKG_VERSION);
      res.setHeader('Cache-Control', 'no-cache');
      sendText(req, res, 200, MIME['.js'], stamped);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
    return true;
  }

  // GET /shared.js, /shell-boot.js, /precache.js, /factory-loader.js
  if (req.method === 'GET' && urlPath === '/shared.js') {
    sendFile(req, res, path.join(__dirname, '..', 'pwa', 'shared.js'), MIME['.js'], 86400);
    return true;
  }
  if (req.method === 'GET' && urlPath === '/shell-boot.js') {
    sendFile(req, res, path.join(__dirname, '..', 'pwa', 'shell-boot.js'), MIME['.js'], 86400);
    return true;
  }
  if (req.method === 'GET' && urlPath === '/precache.js') {
    sendFile(req, res, path.join(__dirname, '..', 'pwa', 'precache.js'), MIME['.js'], 86400);
    return true;
  }
  if (req.method === 'GET' && urlPath === '/factory-loader.js') {
    var loaderPath = resolveFactoryPath(FACTORY_DIR, 'factory-loader.js');
    sendFile(req, res, loaderPath, MIME['.js'], 86400);
    return true;
  }

  // GET /lesson-data.js
  if (req.method === 'GET' && urlPath === '/lesson-data.js') {
    var query = querystring.parse((req.url.split('?')[1]) || '');
    var lessonDataSlug = Array.isArray(query.slug) ? query.slug[0] : query.slug;
    if (!lessonDataSlug) {
      sendText(req, res, 200, MIME['.js'],
        'var LESSON_DATA = null; /* no slug provided */');
      return true;
    }
    getRequestCompileOptions(req, options || {}).then(function (opts) {
      return compile.compileLesson(lessonDataSlug, opts);
    }).then(function (result) {
      if (!result) {
        sendText(req, res, 200, MIME['.js'],
          'var LESSON_DATA = null; /* lesson not found: ' + escapeHtml(lessonDataSlug) + ' */');
        return;
      }
      sendText(req, res, 200, MIME['.js'],
        'var LESSON_DATA = ' + JSON.stringify(result.lessonIR) + ';');
    }).catch(function (err) {
      if (err && err.code === 'QUEUED' && typeof err.retryAfter === 'number') {
        res.setHeader('Retry-After', String(err.retryAfter));
        sendText(req, res, 202, MIME['.js'],
          'var LESSON_DATA = null; /* queued, retry after ' + err.retryAfter + 's */');
        return;
      }
      sendText(req, res, 200, MIME['.js'],
        'var LESSON_DATA = null; /* error: ' + escapeHtml(err.message) + ' */');
    });
    return true;
  }

  return false;
}

module.exports = {
  handleRequest:           handleRequest,
  getRequestCompileOptions: getRequestCompileOptions
};
