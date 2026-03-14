'use strict';

/**
 * lesson-server/assemble.js
 * HTML assembly from IR: device binding (signing), PWA shell wrapper.
 */

const fs   = require('fs');
const path = require('path');

const { signContent, canonicalJSON, getPublicKeySpki } = require('@agni/utils/crypto');
const generateNonce = require('@agni/utils/csp').generateNonce;
const buildCspMeta  = require('@agni/utils/csp').buildCspMeta;
const lessonAssembly = require('@ols/compiler/services/lesson-assembly');
const _escapeHtml   = require('@agni/utils/io').escapeHtml;
const { resolveFactoryPath } = require('@agni/utils/runtimeManifest');

/**
 * Assemble HTML from cached IR with per-request signing (device binding).
 * @param  {object} ir
 * @param  {object} options { deviceId, privateKey, publicKeySpki, dev }
 * @returns {string}
 */
function assembleHtml(ir, options) {
  const runtimeDir = require('@agni/runtime').RUNTIME_ROOT;
  const factoryLoaderJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'factory-loader.js'), 'utf8');
  const stepRenderersJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'step-renderers.js'), 'utf8');
  const playerJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'player.js'), 'utf8');
  const styles = fs.readFileSync(path.join(runtimeDir, 'style.css'), 'utf8');
  const opts = options || {};
  const deviceId = opts.deviceId || null;
  const privateKeyPath = opts.privateKey || null;
  let publicKeySpki = opts.publicKeySpki;
  if (publicKeySpki == null && privateKeyPath) publicKeySpki = getPublicKeySpki(privateKeyPath) || '';
  const nonce = generateNonce();
  const nonceBootstrap = 'window.AGNI_CSP_NONCE=' + JSON.stringify(nonce) + ';';
  let signature = null;
  if (deviceId && privateKeyPath) {
    signature = signContent(canonicalJSON(ir), deviceId, privateKeyPath);
  }
  const lessonScript = nonceBootstrap + '\n' + lessonAssembly.buildLessonScript(ir, {
    signature:       signature != null ? signature : '',
    publicKeySpki:   publicKeySpki != null ? publicKeySpki : '',
    deviceId:        deviceId || '',
    factoryLoaderJs: factoryLoaderJs,
    stepRenderersJs: stepRenderersJs,
    playerJs:        playerJs
  });
  return buildPwaShell(ir, styles, lessonScript, nonce);
}

/**
 * Wrap compiled lesson content in the PWA shell HTML.
 */
function buildPwaShell(ir, styles, lessonScript, nonce) {
  const lang    = _escapeHtml((ir.meta && ir.meta.language) || 'en');
  const title   = _escapeHtml((ir.meta && ir.meta.title) || 'AGNI Lesson');
  const cspMeta = buildCspMeta(nonce);
  const nonceAttr = ' nonce="' + nonce + '"';

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
