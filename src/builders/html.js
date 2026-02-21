//src/builders/html.js
const fs = require('fs');
const path = require('path');
const { signContent } = require('../utils/crypto');
const { ensureDir } = require('../utils/io');
const config = require('../config');

async function buildHtml(lessonData, options) {
  console.log(`🌍 Building HTML for Device: ${options.deviceId || 'Unbound (Development Mode)'}`);

  // ── 1. Stamp dev mode onto lesson data so the runtime can read it ─────────
  // The runtime must never hardcode DEV_MODE — it reads lesson._devMode only.
  const runtimeMeta = {
    ...lessonData,
    _devMode: options.dev === true   // only true when --dev flag was passed
  };

  // ── 2. Process Markdown in each step (async) ──────────────────────────────
  console.log("Processing Markdown content asynchronously...");
  const runtimeData = {
    ...runtimeMeta,
    steps: await Promise.all(
      (lessonData.steps || []).map(async (step) => {
        let htmlContent = '';
        if (step.content) {
          try {
            htmlContent = await config.processMarkdown(step.content);
          } catch (err) {
            console.error(`Markdown failed for step ${step.id}:`, err.message);
            htmlContent = step.content.replace(/\n/g, '<br>');
          }
        }
        return { ...step, htmlContent };
      })
    )
  };

  // ── 3. Read lesson-specific runtime & styles ──────────────────────────────
  const playerJs = fs.readFileSync(path.join(__dirname, '../runtime/player.js'), 'utf8');
  const styles   = fs.readFileSync(path.join(__dirname, '../runtime/style.css'),  'utf8');

  // ── 4. Handle shared-runtime.js (write once, reuse across lessons) ────────
  const outputDir    = path.dirname(options.output);
  const sharedOutput = path.join(outputDir, 'shared-runtime.js');
  const sharedSource = path.join(__dirname, '../runtime/shared-runtime.js');

  let shouldWriteShared = false;

  if (!fs.existsSync(sharedOutput)) {
    shouldWriteShared = true;
    console.log("Shared runtime missing → generating");
  } else {
    const sourceStat = fs.statSync(sharedSource);
    const destStat   = fs.statSync(sharedOutput);
    if (sourceStat.mtimeMs > destStat.mtimeMs) {
      shouldWriteShared = true;
      console.log("Shared runtime source newer → updating");
    }
  }

  if (shouldWriteShared) {
    const sharedCode = fs.readFileSync(sharedSource, 'utf8');
    ensureDir(outputDir);
    fs.writeFileSync(sharedOutput, sharedCode);
    console.log(`Shared runtime generated/updated: ${sharedOutput}`);
  } else {
    console.log(`Shared runtime up-to-date: ${sharedOutput}`);
  }

  // ── 5. Serialize & sign lesson data ──────────────────────────────────────
  const dataString    = JSON.stringify(runtimeData);
  const signature     = signContent(dataString, options.deviceId, options.privateKey);
  const safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // ── 6. Lesson-specific script ─────────────────────────────────────────────
  const lessonScript = `
    window.LESSON_DATA         = ${safeDataString};
    window.OLS_SIGNATURE       = ${JSON.stringify(signature || '')};
    window.OLS_INTENDED_OWNER  = ${JSON.stringify(options.deviceId || '')};

    ${playerJs}

    // Safety net: hide loading if init stalls
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
      }, 5000);
    });
  `;

  // ── 7. Assemble HTML ──────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="${lessonData.meta.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1a2e">
  <title>${escapeHtml(lessonData.meta.title || 'AGNI Lesson')}</title>
  <style>${styles}</style>
</head>
<body>
  <div id="loading">Loading lesson...</div>
  <div id="app"></div>
  <script src="./shared-runtime.js"></script>
  <script>
    ${lessonScript}
  </script>
</body>
</html>`;

  // ── 8. Write lesson HTML ──────────────────────────────────────────────────
  ensureDir(outputDir);
  fs.writeFileSync(options.output, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✅ Lesson HTML: ${options.output} (${sizeKB} KB)`);

  if (parseFloat(sizeKB) > 500) {
    console.warn(`⚠️  Lesson HTML exceeds 500KB (${sizeKB} KB)`);
  }
}

/** Escape HTML special characters */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = buildHtml;
