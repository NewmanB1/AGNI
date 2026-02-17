const fs = require('fs');
const path = require('path');
const { signContent } = require('../utils/crypto');
const { ensureDir } = require('../utils/io');

// Async Markdown processor
const config = require('../config');

async function buildHtml(lessonData, options) {
  console.log(`🌍 Building HTML for Device: ${options.deviceId || 'Unbound (Development Mode)'}`);

  // 1. Process Markdown in each step (async)
  console.log("Processing Markdown content asynchronously...");
  const runtimeData = {
    ...lessonData,
    steps: await Promise.all(
      (lessonData.steps || []).map(async (step) => {
        let htmlContent = '';
        if (step.content) {
          try {
            htmlContent = await config.processMarkdown(step.content);
          } catch (err) {
            console.error(`Markdown failed for step ${step.id}:`, err.message);
            htmlContent = step.content.replace(/\n/g, '<br>'); // fallback
          }
        }
        return {
          ...step,
          htmlContent
        };
      })
    )
  };

  // 2. Read lesson-specific runtime (player.js)
  const playerJs = fs.readFileSync(path.join(__dirname, '../runtime/player.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../runtime/style.css'), 'utf8');

  // 3. Generate shared-runtime.js (once per build directory)
  const outputDir = path.dirname(options.output);
  const sharedOutput = path.join(outputDir, 'shared-runtime.js');

  // Check if shared already exists (to avoid overwriting unnecessarily)
  const sharedSource = path.join(__dirname, '../runtime/shared-runtime.js');
  if (!fs.existsSync(sharedOutput) || fs.readFileSync(sharedSource, 'utf8') !== fs.readFileSync(sharedOutput, 'utf8')) {
    const sharedCode = fs.readFileSync(sharedSource, 'utf8');
    ensureDir(outputDir);
    fs.writeFileSync(sharedOutput, sharedCode);
    console.log(`Shared runtime generated/updated: ${sharedOutput}`);
  } else {
    console.log(`Shared runtime already exists: ${sharedOutput}`);
  }

  // 4. Serialize & sign lesson-specific data only
  const dataString = JSON.stringify(runtimeData);
  const signature = signContent(dataString, options.deviceId, options.privateKey);
  const safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // 5. Lesson-specific script (minimal – relies on shared-runtime.js)
  const lessonScript = `
    window.LESSON_DATA = ${safeDataString};
    window.OLS_SIGNATURE = ${JSON.stringify(signature || '')};
    window.OLS_INTENDED_OWNER = ${JSON.stringify(options.deviceId || '')};

    // Lesson-specific runtime code
    ${playerJs}

    // Safety net: hide loading if init fails
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
      }, 5000);
    });
  `;

  // 6. Lesson HTML – loads shared-runtime.js from same directory
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

  // 7. Write lesson HTML
  ensureDir(outputDir);
  fs.writeFileSync(options.output, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✅ Lesson HTML generated: ${options.output} (${sizeKB} KB)`);

  if (parseFloat(sizeKB) > 500) {
    console.warn(`⚠️ Lesson HTML exceeds 500KB target (${sizeKB} KB)`);
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
