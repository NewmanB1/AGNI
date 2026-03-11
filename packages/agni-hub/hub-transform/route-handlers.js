'use strict';

/**
 * hub-transform/route-handlers.js
 * HTTP request routing and handling: /lessons/, /factories/, /katex/, PWA assets, etc.
 */

const fs   = require('fs');
const path = require('path');
const querystring = require('querystring');

const { extractStudentSessionToken, getClientIp } = require('@agni/utils/http-helpers');
const accountsService = require('@agni/services/accounts');

const compile   = require('./compile');
const assemble  = require('./assemble');
const serveAssets = require('./serve-assets');
const factoryManifest = require('./factory-manifest');

const createLogger = require('@agni/utils/logger').createLogger;
const log = createLogger('hub-transform');

const PKG_VERSION = require('../../../package.json').version || '0.0.0';
const SHELL_PLACEHOLDER = '<script src="/lesson-data.js"></script>';
let _shellTemplate = null;

const sendText  = serveAssets.sendText;
const sendJson  = serveAssets.sendJson;
const sendFile  = serveAssets.sendFile;
const MIME      = serveAssets.MIME;
const ALLOWED_FACTORY_FILES = serveAssets.ALLOWED_FACTORY_FILES;
const ALLOWED_KATEX_FILES   = serveAssets.ALLOWED_KATEX_FILES;
const FACTORY_DIR = serveAssets.FACTORY_DIR;
const KATEX_DIR   = serveAssets.KATEX_DIR;
const resolveFactoryPath = serveAssets.resolveFactoryPath;
const escapeHtml = assemble.escapeHtml;

/**
 * Resolve per-request compile options from student session.
 */
function getRequestCompileOptions(req, baseOptions) {
  const base = baseOptions || {};
  const token = extractStudentSessionToken(req);
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
  const urlPath = req.url.split('?')[0];

  // GET /shell/:slug
  const shellMatch = urlPath.match(/^\/shell\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && shellMatch) {
    const shellSlug = shellMatch[1];
    try {
      if (_shellTemplate === null) {
        _shellTemplate = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'shell.html'), 'utf8');
        if (_shellTemplate.indexOf(SHELL_PLACEHOLDER) === -1) {
          throw new Error('shell.html is missing the lesson-data.js placeholder script tag');
        }
      }
      const shellHtml = _shellTemplate.replace(
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
      const libPath = path.join(__dirname, '..', 'pwa', 'library.html');
      sendFile(req, res, libPath, MIME['.html'], 3600);
    } catch {
      sendText(req, res, 500, 'text/html; charset=utf-8', '<h1>Library error</h1>');
    }
    return true;
  }

  // GET /library.js
  if (req.method === 'GET' && urlPath === '/library.js') {
    const runtimeRoot = require('@agni/runtime').RUNTIME_ROOT;
    const libJsPath = path.join(runtimeRoot, 'shell', 'library.js');
    sendFile(req, res, libJsPath, MIME['.js'], 3600);
    return true;
  }

  // GET /lessons/:slug/sidecar
  const sidecarMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)\/sidecar$/);
  if (req.method === 'GET' && sidecarMatch) {
    const sidecarSlug = sidecarMatch[1];
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
  const lessonMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)$/);
  if (req.method === 'GET' && lessonMatch) {
    const slug = lessonMatch[1];
    getRequestCompileOptions(req, options || {}).then(function (opts) {
      return compile.compileLesson(slug, opts).then(function (result) {
        if (!result) {
          sendText(req, res, 404, 'text/html; charset=utf-8',
            '<h1>Lesson not found</h1><p>No YAML source found for: ' +
            escapeHtml(slug) + '</p>');
          return;
        }
        const html = assemble.assembleHtml(result.ir, opts);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        sendText(req, res, 200, 'text/html; charset=utf-8', html);
      });
    }).catch(function (err) {
      if (err && err.code === 'QUEUED' && typeof err.retryAfter === 'number') {
        const retrySec = err.retryAfter;
        const lessonUrl = '/lessons/' + encodeURIComponent(slug);
        const body202 = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="' + retrySec + ';url=' + escapeHtml(lessonUrl) + '"><title>Please wait</title></head><body><p>Server busy. Retrying in ' + retrySec + ' seconds\u2026</p><p><a href="' + lessonUrl + '">Click here if not redirected</a></p></body></html>';
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

  // GET /factories/manifest.json — hub-signed factory manifest (P0 #5)
  if (req.method === 'GET' && urlPath === '/factories/manifest.json') {
    try {
      const manifest = factoryManifest.getFactoryManifest();
      sendJson(req, res, 200, manifest);
    } catch (err) {
      log.warn('Factory manifest error', { error: err.message });
      sendJson(req, res, 500, { error: 'Manifest unavailable' });
    }
    return true;
  }

  // GET /factories/:file
  const factoryMatch = urlPath.match(/^\/factories\/(.+)$/);
  if (req.method === 'GET' && factoryMatch) {
    const factoryFile = path.basename(factoryMatch[1]);
    if (!ALLOWED_FACTORY_FILES.has(factoryFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const factoryPath = resolveFactoryPath(FACTORY_DIR, factoryFile);
    sendFile(req, res, factoryPath, MIME['.js'], 604800);
    return true;
  }

  // GET /katex/:file
  const katexMatch = urlPath.match(/^\/katex\/(.+)$/);
  if (req.method === 'GET' && katexMatch) {
    const katexFile = path.basename(katexMatch[1]);
    if (!ALLOWED_KATEX_FILES.has(katexFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const katexPath = path.join(KATEX_DIR, katexFile);
    sendFile(req, res, katexPath, MIME['.css'], 2592000);
    return true;
  }

  // GET /manifest.json
  if (req.method === 'GET' && urlPath === '/manifest.json') {
    const manifestPath = path.join(__dirname, '..', 'manifest.json');
    sendFile(req, res, manifestPath, MIME['.json'], 86400);
    return true;
  }

  // GET /sw.js
  if (req.method === 'GET' && urlPath === '/sw.js') {
    const swPath = path.join(__dirname, '..', 'sw.js');
    try {
      const raw = fs.readFileSync(swPath, 'utf8');
      const stamped = raw.replace('__SW_VERSION__', PKG_VERSION);
      res.setHeader('Cache-Control', 'no-cache');
      sendText(req, res, 200, MIME['.js'], stamped);
    } catch {
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
    const loaderPath = resolveFactoryPath(FACTORY_DIR, 'factory-loader.js');
    sendFile(req, res, loaderPath, MIME['.js'], 86400);
    return true;
  }

  // GET /lesson-data.js
  if (req.method === 'GET' && urlPath === '/lesson-data.js') {
    const query = querystring.parse((req.url.split('?')[1]) || '');
    const lessonDataSlug = Array.isArray(query.slug) ? query.slug[0] : query.slug;
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
