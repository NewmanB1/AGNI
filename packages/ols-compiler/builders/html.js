'use strict';

const fs   = require('fs');
const path = require('path');
const { createLogger } = require('@agni/utils/logger');

const log = createLogger('html-builder');

const { signContent, SIG_PLACEHOLDER } = require('@agni/utils/crypto');
const { generateNonce, buildCspMeta } = require('@agni/utils/csp');
const io                 = require('@agni/utils/io');
const ensureDir          = io.ensureDir;
const copyIfNewer        = io.copyIfNewer;
const escapeHtml         = io.escapeHtml;
const compiler           = require('../compiler/build-lesson-ir');
const buildLessonIR      = compiler.buildLessonIR;
const buildLessonSidecar = compiler.buildLessonSidecar;
const buildKatexCss      = require('@agni/utils/katex-css-builder').buildKatexCss;
const { resolveFactoryPath } = require('@agni/utils/runtimeManifest');
const lessonAssembly     = require('../services/lesson-assembly');

function readPublicKeySpki(publicKeyPath) {
  if (!publicKeyPath) return null;
  try {
    const crypto     = require('crypto');
    const pemContent = fs.readFileSync(publicKeyPath, 'utf8');
    const keyObject  = crypto.createPublicKey({ key: pemContent, format: 'pem' });
    const derBuffer  = keyObject.export({ type: 'spki', format: 'der' });
    return derBuffer.toString('base64');
  } catch (err) {
    log.warn('Could not read public key: ' + err.message);
    return null;
  }
}

async function buildHtml(lessonData, options) {
  log.info('Building lesson: ' + ((lessonData.meta && lessonData.meta.title) || 'Unnamed'));
  log.info('Device: ' + (options.deviceId || 'Unbound (Development Mode)'));

  const ir = await buildLessonIR(lessonData, options);

  const outputDir   = path.dirname(options.output);
  const sidecar     = buildLessonSidecar(ir);
  const sidecarPath = options.output.replace(/\.html$/, '-ir.json');
  ensureDir(outputDir);
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  log.info('Sidecar written: ' + sidecarPath);

  buildKatexCss(ir.inferredFeatures.katexAssets, outputDir);

  const runtimeDir = require('@agni/runtime').RUNTIME_ROOT;

  const playerJs        = fs.readFileSync(resolveFactoryPath(runtimeDir, 'player.js'),         'utf8');
  const factoryLoaderJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'factory-loader.js'), 'utf8');
  const styles          = fs.readFileSync(path.join(runtimeDir, 'style.css'),          'utf8');

  const factoriesDir = path.join(outputDir, 'factories');
  ensureDir(factoriesDir);

  const polyfillsSource = path.join(runtimeDir, 'polyfills.js');
  const binaryUtilsSource = resolveFactoryPath(runtimeDir, 'binary-utils.js');
  const sharedSource = path.join(runtimeDir, 'shared-runtime.js');

  const factoryFilesToCopy = [];
  if (fs.existsSync(polyfillsSource)) factoryFilesToCopy.push('polyfills.js');
  if (fs.existsSync(binaryUtilsSource)) factoryFilesToCopy.push('binary-utils.js');
  factoryFilesToCopy.push('shared-runtime.js');
  factoryFilesToCopy.push('integrity.js');

  const manifest = (ir.inferredFeatures && ir.inferredFeatures.factoryManifest) || [];
  manifest.forEach(function (filename) {
    if (factoryFilesToCopy.indexOf(filename) === -1) factoryFilesToCopy.push(filename);
  });

  factoryFilesToCopy.forEach(function (filename) {
    var srcPath = resolveFactoryPath(runtimeDir, filename);
    if (!fs.existsSync(srcPath)) srcPath = path.join(runtimeDir, filename);
    if (fs.existsSync(srcPath)) {
      var destPath = path.join(factoriesDir, filename);
      if (copyIfNewer(srcPath, destPath)) {
        log.info('Factory written: ' + destPath);
      }
    }
  });

  var pkgVersion = require(path.join(__dirname, '../../../package.json')).version;
  var RUNTIME_VERSION = pkgVersion;

  const factoryDeps = factoryFilesToCopy.map(function (file) {
    return { file: file, version: RUNTIME_VERSION };
  });

  ir.requires = { factories: factoryDeps };

  const publicKeySpki = readPublicKeySpki(options.publicKey);

  if (options.deviceId && !publicKeySpki) {
    log.warn('Device binding requested but public key not available.');
    log.warn('Runtime verification will fail. Pass --public-key <path>.');
  }

  if (publicKeySpki) {
    log.info('Public key embedded (SPKI DER, ' +
      Buffer.from(publicKeySpki, 'base64').length + ' bytes)');
  }

  const nonce = generateNonce();
  const nonceBootstrap = 'window.AGNI_CSP_NONCE=' + JSON.stringify(nonce) + ';';
  let signature = null;
  if (options.skipSigning) {
    log.info('Signing skipped (--skip-signing)');
  } else if (options.deviceId && options.privateKey) {
    const scriptWithPlaceholder = nonceBootstrap + '\n' + lessonAssembly.buildLessonScript(ir, {
      signature:       SIG_PLACEHOLDER,
      publicKeySpki:   publicKeySpki || '',
      deviceId:        options.deviceId || '',
      factoryLoaderJs: factoryLoaderJs,
      playerJs:        playerJs
    });
    signature = signContent(scriptWithPlaceholder, options.deviceId, options.privateKey);
  } else if (options.deviceId) {
    throw new Error('Device binding requested but --private-key not provided. Use --skip-signing for unsigned builds.');
  }
  const lessonScript = nonceBootstrap + '\n' + lessonAssembly.buildLessonScript(ir, {
    signature:       signature,
    publicKeySpki:   publicKeySpki || '',
    deviceId:        options.deviceId || '',
    factoryLoaderJs: factoryLoaderJs,
    playerJs:        playerJs
  });
  const cspMeta = buildCspMeta(nonce);
  const nonceAttr = ' nonce="' + nonce + '"';

  const html = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeHtml((ir.meta && ir.meta.language) || 'en') + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta name="theme-color" content="#F4F1E8">',
    '  ' + cspMeta,
    '  <title>' + escapeHtml((ir.meta && ir.meta.title) || 'AGNI Lesson') + '</title>',
    '  <style>' + styles + '</style>',
    '</head>',
    '<body>',
    '  <div id="loading">Loading lesson\u2026</div>',
    '  <div id="app"></div>',
    '  <script' + nonceAttr + '>',
    lessonScript,
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');

  fs.writeFileSync(options.output, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  log.info('Lesson HTML: ' + options.output + ' (' + sizeKB + ' KB)');

  if (parseFloat(sizeKB) > 500) {
    log.warn('Lesson HTML exceeds 500KB (' + sizeKB + ' KB)');
  }
}

module.exports = buildHtml;
