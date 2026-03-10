#!/usr/bin/env node
'use strict';

/**
 * CI gate: verify factory loading pipeline wiring and cross-file consistency.
 *
 * Part A — Polyfills Wiring (original checks):
 *   1. packages/agni-runtime/polyfills.js exists
 *   2. polyfills.js is in ALLOWED_FACTORY_FILES in packages/agni-hub/hub-transform.js
 *   3. polyfills.js is pushed to factoryDeps in packages/ols-compiler/builders/html.js
 *   4. polyfills.js appears BEFORE shared-runtime.js in factoryDeps
 *
 * Part B — Cross-File Consistency:
 *   5. RUNTIME_VERSION in hub-transform.js references package.json (not hardcoded)
 *   6. RUNTIME_VERSION in html.js references package.json (not hardcoded)
 *   7. hub-transform.js factoryDeps order: polyfills before shared-runtime
 *   8. Every file in sw.js PRECACHE_FACTORIES is in ALLOWED_FACTORY_FILES
 *   9. shell.html loads polyfills.js before shared.js and factory-loader.js
 *
 * Part C — Sanitizer Parity (XSS C1 guard):
 *  13. shared.js EVENT_RE handles unquoted on* handlers
 *  14. shared-runtime.js ON_ATTR_RE handles unquoted on* handlers
 *  15. shared.js sanitizeHtml blocks core XSS vectors (functional test)
 *
 * Part D — Entity-Encoding Bypass Guard:
 *  16. shared.js has _decodeNumericEntities
 *  17. shared-runtime.js has _decodeNumericEntities
 *  18. shared-runtime.js JS_URI_RE is global (not attribute-specific)
 *  19. shared.js sanitizeHtml blocks entity-encoded javascript: URIs (functional test)
 *
 * Exit 0 on pass, exit 1 on any failure.
 */

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var failed = false;

function fail(msg) {
  console.error('FAIL  ' + msg);
  failed = true;
}

function pass(msg) {
  console.log('OK    ' + msg);
}

// ── Part A: Polyfills Wiring ─────────────────────────────────────────────

// 1. polyfills.js exists
var polyfillPath = require.resolve('@agni/runtime/polyfills');
if (fs.existsSync(polyfillPath)) {
  pass('packages/agni-runtime/polyfills.js exists');
} else {
  fail('packages/agni-runtime/polyfills.js does not exist');
}

// 2. polyfills.js in ALLOWED_FACTORY_FILES (hub-transform/constants.js)
var constantsPath = path.join(root, 'packages', 'agni-hub', 'hub-transform', 'constants.js');
var hubConstants = require(constantsPath);
if (!hubConstants.ALLOWED_FACTORY_FILES || !hubConstants.ALLOWED_FACTORY_FILES.has) {
  fail('hub-transform/constants.js does not export ALLOWED_FACTORY_FILES Set');
} else if (hubConstants.ALLOWED_FACTORY_FILES.has('polyfills.js')) {
  pass('polyfills.js is in ALLOWED_FACTORY_FILES (packages/agni-hub/hub-transform/constants.js)');
} else {
  fail('polyfills.js is NOT in ALLOWED_FACTORY_FILES (packages/agni-hub/hub-transform/constants.js)');
}

// 3 & 4. polyfills.js is pushed to factoryDeps/factoryFilesToCopy in html.js, before shared-runtime.js
var htmlBuilderPath = path.join(root, 'packages', 'ols-compiler', 'builders', 'html.js');
var htmlSrc = fs.readFileSync(htmlBuilderPath, 'utf8');

var polyfillPushRe = /(?:factoryDeps|factoryFilesToCopy)\.push\(\s*(?:\{\s*file:\s*)?['"]polyfills\.js['"]/;
var sharedPushRe = /(?:factoryDeps|factoryFilesToCopy)\.push\(\s*(?:\{\s*file:\s*)?['"]shared-runtime\.js['"]/;

var polyfillPushMatch = polyfillPushRe.exec(htmlSrc);
var sharedPushMatch = sharedPushRe.exec(htmlSrc);

if (!polyfillPushMatch) {
  fail('polyfills.js is NOT pushed to factoryDeps in packages/ols-compiler/builders/html.js — the factory loader will never load it');
} else {
  pass('polyfills.js is pushed to factoryDeps (packages/ols-compiler/builders/html.js)');

  if (sharedPushMatch && polyfillPushMatch.index < sharedPushMatch.index) {
    pass('polyfills.js is ordered BEFORE shared-runtime.js in factoryDeps (html.js)');
  } else if (sharedPushMatch) {
    fail('polyfills.js is ordered AFTER shared-runtime.js in html.js — polyfills must load first');
  } else {
    fail('Could not find shared-runtime.js push in factoryDeps to verify ordering');
  }
}

// ── Part B: Cross-File Consistency ───────────────────────────────────────

// 5. hub-transform constants RUNTIME_VERSION references package.json
var constantsSrc = fs.readFileSync(constantsPath, 'utf8');
if (constantsSrc.indexOf('package.json') === -1) {
  fail('hub-transform/constants.js RUNTIME_VERSION must use require(\'../../../package.json\')');
} else {
  pass('packages/agni-hub/hub-transform/constants.js RUNTIME_VERSION references package.json');
}

// 6. html.js RUNTIME_VERSION must reference package.json, not a hardcoded literal
var htmlVersionLine = htmlSrc.match(/RUNTIME_VERSION\s*=\s*(.+)/);
if (!htmlVersionLine) {
  fail('Could not find RUNTIME_VERSION assignment in html.js');
} else {
  var htmlVersionExpr = htmlVersionLine[1].trim();
  if (htmlVersionExpr.indexOf('pkgVersion') !== -1 || htmlVersionExpr.indexOf('package.json') !== -1) {
    pass('html.js RUNTIME_VERSION references package.json (via pkgVersion)');
  } else if (/^['"]/.test(htmlVersionExpr)) {
    fail('html.js RUNTIME_VERSION is a hardcoded string literal: ' + htmlVersionExpr + ' — must use package.json');
  } else {
    pass('html.js RUNTIME_VERSION uses a dynamic expression: ' + htmlVersionExpr);
  }
}

// 7. hub-transform BASE_FACTORY_DEPS order: polyfills before shared-runtime
var baseDeps = hubConstants.BASE_FACTORY_DEPS;
if (!Array.isArray(baseDeps)) {
  fail('hub-transform/constants.js BASE_FACTORY_DEPS must be an array');
} else {
  var htPolyIdx = baseDeps.findIndex(function (d) { return d.file === 'polyfills.js'; });
  var htSharedIdx = baseDeps.findIndex(function (d) { return d.file === 'shared-runtime.js'; });
  if (htPolyIdx === -1) {
    fail('polyfills.js missing from hub-transform/constants.js BASE_FACTORY_DEPS');
  } else if (htSharedIdx === -1) {
    fail('shared-runtime.js missing from hub-transform/constants.js BASE_FACTORY_DEPS');
  } else if (htPolyIdx < htSharedIdx) {
    pass('packages/agni-hub/hub-transform/constants.js BASE_FACTORY_DEPS: polyfills.js before shared-runtime.js');
  } else {
    fail('packages/agni-hub/hub-transform BASE_FACTORY_DEPS: polyfills.js must come before shared-runtime.js');
  }
}

// 8. Every file in sw.js PRECACHE_FACTORIES is in ALLOWED_FACTORY_FILES
var swPath = path.join(root, 'packages', 'agni-hub', 'sw.js');
if (fs.existsSync(swPath)) {
  var swSrc = fs.readFileSync(swPath, 'utf8');
  var precacheMatch = swSrc.match(/PRECACHE_FACTORIES\s*=\s*\[([\s\S]*?)\]/);
  if (!precacheMatch) {
    fail('Could not parse PRECACHE_FACTORIES in sw.js');
  } else {
    var precacheFiles = precacheMatch[1].match(/['"]\/factories\/([^'"]+)['"]/g) || [];
    var allInAllowed = true;
    precacheFiles.forEach(function (entry) {
      var filename = entry.replace(/['"]/g, '').replace('/factories/', '');
      if (!hubConstants.ALLOWED_FACTORY_FILES.has(filename)) {
        fail('sw.js precaches ' + filename + ' but it is NOT in ALLOWED_FACTORY_FILES');
        allInAllowed = false;
      }
    });
    if (allInAllowed && precacheFiles.length > 0) {
      pass('All PRECACHE_FACTORIES entries are in ALLOWED_FACTORY_FILES (' + precacheFiles.length + ' files)');
    }
  }
} else {
  fail('packages/agni-hub/sw.js does not exist');
}

// 9. shell.html loads polyfills.js before shared.js and factory-loader.js
var shellPath = path.join(root, 'packages', 'agni-hub', 'pwa', 'shell.html');
if (fs.existsSync(shellPath)) {
  var shellSrc = fs.readFileSync(shellPath, 'utf8');
  var shellPolyIdx = shellSrc.indexOf('polyfills.js');
  var shellSharedIdx = shellSrc.indexOf('shared.js');
  var shellLoaderIdx = shellSrc.indexOf('factory-loader.js');

  if (shellPolyIdx === -1) {
    fail('shell.html does not load polyfills.js');
  } else if (shellSharedIdx !== -1 && shellPolyIdx < shellSharedIdx) {
    pass('shell.html loads polyfills.js before shared.js');
  } else if (shellSharedIdx !== -1) {
    fail('shell.html loads polyfills.js AFTER shared.js — polyfills must come first');
  }

  if (shellPolyIdx !== -1 && shellLoaderIdx !== -1 && shellPolyIdx < shellLoaderIdx) {
    pass('shell.html loads polyfills.js before factory-loader.js');
  } else if (shellLoaderIdx !== -1) {
    fail('shell.html loads polyfills.js AFTER factory-loader.js');
  }
} else {
  fail('packages/agni-hub/pwa/shell.html does not exist');
}

// 10. hub-transform route-handlers has /shell/ route that serves shell.html via cached template
var routeHandlersPath = path.join(root, 'packages', 'agni-hub', 'hub-transform', 'route-handlers.js');
var routeHandlersSrc = fs.readFileSync(routeHandlersPath, 'utf8');
var hasShellRouteRegex = /urlPath\.match\(.*shell/.test(routeHandlersSrc);
var hasShellHtmlRef = /pwa.*shell\.html/.test(routeHandlersSrc);
var hasShellTemplateCache = /_shellTemplate/.test(routeHandlersSrc);
if (hasShellRouteRegex && hasShellHtmlRef) {
  pass('packages/agni-hub/hub-transform.js has /shell/ route regex that references pwa/shell.html');
} else if (!hasShellRouteRegex) {
  fail('packages/agni-hub/hub-transform.js has no /shell/ URL match — shell.html is dead code (no route serves it)');
} else {
  fail('packages/agni-hub/hub-transform.js /shell/ route does not reference pwa/shell.html');
}

if (hasShellTemplateCache) {
  pass('packages/agni-hub/hub-transform.js caches shell template in _shellTemplate (no per-request blocking I/O)');
} else {
  fail('packages/agni-hub/hub-transform.js missing _shellTemplate cache — shell.html would be re-read from disk on every request');
}

// 11. shell.html contains the lesson-data.js placeholder that the /shell/ route injects into
var shellPlaceholder = '<script src="/lesson-data.js"></script>';
if (shellSrc.indexOf(shellPlaceholder) !== -1) {
  pass('shell.html contains lesson-data.js placeholder for slug injection');
} else {
  fail('shell.html missing placeholder \'' + shellPlaceholder + '\' — /shell/:slug route will fail to inject slug');
}

// 12. hub-transform route-handlers sets Cache-Control on shell route
var shellCacheControl = /shellMatch[\s\S]{0,1500}Cache-Control/.test(routeHandlersSrc);
if (shellCacheControl) {
  pass('packages/agni-hub/hub-transform.js sets Cache-Control on /shell/ route');
} else {
  fail('packages/agni-hub/hub-transform.js missing Cache-Control on /shell/ route — browser may serve cached shell with wrong slug');
}

// ── Part C: Sanitizer Parity ──────────────────────────────────────────────

// 13. shared.js EVENT_RE must handle unquoted on* handlers (XSS C1 guard)
var sharedJsPath = path.join(root, 'packages', 'agni-hub', 'pwa', 'shared.js');
if (fs.existsSync(sharedJsPath)) {
  var sharedJsSrc = fs.readFileSync(sharedJsPath, 'utf8');
  var sharedEventRe = sharedJsSrc.match(/EVENT_RE\s*=\s*(\/.*\/\w*);/);
  if (!sharedEventRe) {
    fail('shared.js: EVENT_RE not found');
  } else {
    var sharedPattern = sharedEventRe[1];
    if (sharedPattern.indexOf('[^\\s>]+') !== -1) {
      pass('shared.js EVENT_RE handles unquoted event handlers ([^\\s>]+ branch present)');
    } else {
      fail('shared.js EVENT_RE is missing unquoted-value branch [^\\s>]+ — XSS bypass via <img onerror=alert(1)>. Pattern: ' + sharedPattern);
    }
  }
} else {
  fail('packages/agni-hub/pwa/shared.js does not exist');
}

// 14. shared-runtime.js ON_ATTR_RE must handle unquoted on* handlers (XSS C1 guard)
var sharedRuntimePath = require.resolve('@agni/runtime/shared-runtime');
if (fs.existsSync(sharedRuntimePath)) {
  var sharedRuntimeSrc = fs.readFileSync(sharedRuntimePath, 'utf8');
  var runtimeEventRe = sharedRuntimeSrc.match(/ON_ATTR_RE\s*=\s*(\/.*\/\w*);/);
  if (!runtimeEventRe) {
    fail('shared-runtime.js: ON_ATTR_RE not found');
  } else {
    var runtimePattern = runtimeEventRe[1];
    if (runtimePattern.indexOf('[^\\s>]+') !== -1) {
      pass('shared-runtime.js ON_ATTR_RE handles unquoted event handlers ([^\\s>]+ branch present)');
    } else {
      fail('shared-runtime.js ON_ATTR_RE is missing unquoted-value branch [^\\s>]+ — XSS bypass via <img onerror=alert(1)>. Pattern: ' + runtimePattern);
    }
  }
} else {
  fail('packages/agni-runtime/shared-runtime.js does not exist');
}

// 15. Both sanitizers must strip the same core XSS vectors (functional parity test)
if (fs.existsSync(sharedJsPath)) {
  try {
    var sharedMod = require(sharedJsPath);
    if (typeof sharedMod.sanitizeHtml !== 'function') {
      fail('shared.js does not export sanitizeHtml — regression tests cannot verify it');
    } else {
      var xssVectors = [
        { name: 'unquoted onerror', html: '<img onerror=alert(1) src=x>', banned: 'onerror' },
        { name: 'double-quoted onerror', html: '<img onerror="alert(1)" src=x>', banned: 'onerror' },
        { name: 'single-quoted onerror', html: "<img onerror='alert(1)' src=x>", banned: 'onerror' },
        { name: 'script tag', html: '<script>alert(1)</script>', banned: '<script' },
        { name: 'javascript: URI', html: '<a href="javascript:alert(1)">x</a>', banned: 'javascript' },
      ];
      var allPassed = true;
      xssVectors.forEach(function (v) {
        var result = sharedMod.sanitizeHtml(v.html);
        if (result.toLowerCase().indexOf(v.banned) !== -1) {
          fail('shared.js sanitizeHtml passes through ' + v.name + ': ' + result);
          allPassed = false;
        }
      });
      if (allPassed) {
        pass('shared.js sanitizeHtml blocks all core XSS vectors (unquoted, quoted, script, javascript:)');
      }
    }
  } catch (e) {
    fail('shared.js require() failed: ' + e.message);
  }
}

// ── Part D: Entity-Encoding Bypass Guard ──────────────────────────────────

// 16. shared.js must have _decodeNumericEntities (entity-bypass defense)
if (fs.existsSync(sharedJsPath)) {
  if (sharedJsSrc.indexOf('_decodeNumericEntities') !== -1) {
    pass('shared.js contains _decodeNumericEntities (entity-encoding bypass defense)');
  } else {
    fail('shared.js missing _decodeNumericEntities — &#106;avascript: bypasses JS_URI_RE');
  }
} else {
  fail('packages/agni-hub/pwa/shared.js does not exist');
}

// 17. shared-runtime.js must have _decodeNumericEntities
if (fs.existsSync(sharedRuntimePath)) {
  if (sharedRuntimeSrc.indexOf('_decodeNumericEntities') !== -1) {
    pass('shared-runtime.js contains _decodeNumericEntities (entity-encoding bypass defense)');
  } else {
    fail('shared-runtime.js missing _decodeNumericEntities — &#106;avascript: bypasses JS_URI_RE');
  }
} else {
  fail('packages/agni-runtime/shared-runtime.js does not exist');
}

// 18. shared-runtime.js JS_URI_RE must be global (not attribute-specific)
if (fs.existsSync(sharedRuntimePath)) {
  var runtimeJsUriRe = sharedRuntimeSrc.match(/JS_URI_RE\s*=\s*(\/[^;]+);/);
  if (!runtimeJsUriRe) {
    fail('shared-runtime.js: JS_URI_RE not found');
  } else if (runtimeJsUriRe[1].indexOf('href|src|action') !== -1) {
    fail('shared-runtime.js JS_URI_RE is attribute-specific — misses formaction, data, xlink:href, srcdoc. Found: ' + runtimeJsUriRe[1]);
  } else if (runtimeJsUriRe[1].indexOf('javascript') !== -1) {
    pass('shared-runtime.js JS_URI_RE uses global javascript: pattern');
  } else {
    fail('shared-runtime.js JS_URI_RE does not match javascript:. Found: ' + runtimeJsUriRe[1]);
  }
}

// 19. Functional test: shared.js sanitizeHtml blocks entity-encoded javascript: URIs
if (fs.existsSync(sharedJsPath)) {
  delete require.cache[require.resolve(sharedJsPath)];
  try {
    var sharedModEntity = require(sharedJsPath);
    if (typeof sharedModEntity.sanitizeHtml !== 'function') {
      fail('shared.js does not export sanitizeHtml — cannot verify entity bypass defense');
    } else {
      var entityVectors = [
        { name: 'decimal &#106;avascript:', html: '<a href="&#106;avascript:alert(1)">x</a>', banned: 'javascript' },
        { name: 'hex &#x6A;avascript:', html: '<a href="&#x6A;avascript:alert(1)">x</a>', banned: 'javascript' },
        { name: 'fully encoded', html: '<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3A;alert(1)">x</a>', banned: 'javascript' },
        { name: '&colon; bypass', html: '<a href="javascript&colon;alert(1)">x</a>', banned: 'javascript' },
        { name: 'null byte', html: '<a href="java\x00script:alert(1)">x</a>', banned: 'javascript' },
      ];
      var entityAllPassed = true;
      entityVectors.forEach(function (v) {
        var result = sharedModEntity.sanitizeHtml(v.html);
        if (result.toLowerCase().indexOf(v.banned) !== -1) {
          fail('shared.js sanitizeHtml passes through entity-encoded ' + v.name + ': ' + result);
          entityAllPassed = false;
        }
      });
      if (entityAllPassed) {
        pass('shared.js sanitizeHtml blocks entity-encoded javascript: URIs (5 vectors tested)');
      }
    }
  } catch (e) {
    fail('shared.js require() failed: ' + e.message);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.error('Factory order / consistency check FAILED.');
  console.error('See .cursor/rules/sprint-verification.md for requirements.');
  process.exit(1);
} else {
  console.log('All factory order and consistency checks passed.');
}
