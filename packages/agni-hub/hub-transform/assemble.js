'use strict';

/**
 * hub-transform/assemble.js
 * HTML assembly from IR: device binding (signing), PWA shell wrapper.
 */

var fs   = require('fs');
var path = require('path');

var { signContent, canonicalJSON, getPublicKeySpki } = require('@agni/utils/crypto');
var generateNonce = require('@agni/utils/csp').generateNonce;
var buildCspMeta  = require('@agni/utils/csp').buildCspMeta;
var lessonAssembly = require('@ols/compiler/services/lesson-assembly');
var _escapeHtml   = require('@agni/utils/io').escapeHtml;
var { resolveFactoryPath } = require('@agni/utils/runtimeManifest');

/**
 * Assemble HTML from cached IR with per-request signing (device binding).
 * @param  {object} ir
 * @param  {object} options { deviceId, privateKey, publicKeySpki, dev }
 * @returns {string}
 */
function assembleHtml(ir, options) {
  var runtimeDir = require('@agni/runtime').RUNTIME_ROOT;
  var factoryLoaderJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'factory-loader.js'), 'utf8');
  var playerJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'player.js'), 'utf8');
  var styles = fs.readFileSync(path.join(runtimeDir, 'style.css'), 'utf8');
  var opts = options || {};
  var deviceId = opts.deviceId || null;
  var privateKeyPath = opts.privateKey || null;
  var publicKeySpki = opts.publicKeySpki;
  if (publicKeySpki == null && privateKeyPath) publicKeySpki = getPublicKeySpki(privateKeyPath) || '';
  var nonce = generateNonce();
  var nonceBootstrap = 'window.AGNI_CSP_NONCE=' + JSON.stringify(nonce) + ';';
  var signature = null;
  if (deviceId && privateKeyPath) {
    signature = signContent(canonicalJSON(ir), deviceId, privateKeyPath);
  }
  var lessonScript = nonceBootstrap + '\n' + lessonAssembly.buildLessonScript(ir, {
    signature:       signature != null ? signature : '',
    publicKeySpki:   publicKeySpki != null ? publicKeySpki : '',
    deviceId:        deviceId || '',
    factoryLoaderJs: factoryLoaderJs,
    playerJs:        playerJs
  });
  return buildPwaShell(ir, styles, lessonScript, nonce);
}

/**
 * Wrap compiled lesson content in the PWA shell HTML.
 */
function buildPwaShell(ir, styles, lessonScript, nonce) {
  var lang    = _escapeHtml((ir.meta && ir.meta.language) || 'en');
  var title   = _escapeHtml((ir.meta && ir.meta.title) || 'AGNI Lesson');
  var cspMeta = buildCspMeta(nonce);
  var nonceAttr = ' nonce="' + nonce + '"';

  return [
    '<!DOCTYPE html>',
    '<html lang="' + lang + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta name="theme-color" content="#F4F1E8">',
    '  ' + cspMeta,
    '  <title>' + title + '</title>',
    '  <link rel="manifest" href="/manifest.json">',
    '  <style>' + styles + '</style>',
    '</head>',
    '<body>',
    '  <div id="loading">Loading lesson\u2026</div>',
    '  <div id="app"></div>',
    '  <script' + nonceAttr + '>',
    '  if (\'serviceWorker\' in navigator) {',
    '    navigator.serviceWorker.register(\'/sw.js\')',
    '      .catch(function(e) { console.warn(\'[SW] Registration failed:\', e.message); });',
    '  }',
    '  </script>',
    '  <script' + nonceAttr + '>',
    lessonScript,
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

module.exports = {
  assembleHtml:   assembleHtml,
  buildPwaShell:  buildPwaShell,
  escapeHtml:     _escapeHtml
};
