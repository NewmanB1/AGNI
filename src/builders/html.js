const fs = require('fs');
const path = require('path');
const { processMarkdown } = require('../config');
const { signContent } = require('../utils/crypto');
const { ensureDir } = require('../utils/io');

function buildHtml(lessonData, options) {
  console.log(`🌍 Building HTML for Device: ${options.deviceId || 'Unbound (Development Mode)'}`);

  // 1. Process Markdown in each step
  const runtimeData = {
    ...lessonData,
    steps: lessonData.steps.map(step => ({
      ...step,
      htmlContent: processMarkdown(step.content)
    }))
  };

  // 2. Read Source Templates
  const runtimeJs = fs.readFileSync(path.join(__dirname, '../runtime/player.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../runtime/style.css'), 'utf8');

  // 3. Serialize & Sign
  //    Use JSON.stringify for safe embedding — prevents template literal injection
  const dataString = JSON.stringify(runtimeData);
  const signature = signContent(dataString, options.deviceId, options.privateKey);

  // 4. Safe data injection
  //    Escape </script> to prevent premature tag closure
  const safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  const finalScript = `
    window.LESSON_DATA = ${safeDataString};
    window.OLS_SIGNATURE = ${JSON.stringify(signature || '')};
    window.OLS_INTENDED_OWNER = ${JSON.stringify(options.deviceId || '')};

    ${runtimeJs}
  `;

  // 5. Assembly
  const html = `<!DOCTYPE html>
<html lang="${lessonData.meta.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1a2e">
  <title>${escapeHtml(lessonData.meta.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div id="app">Loading lesson...</div>
  <script>${finalScript}</script>
</body>
</html>`;

  ensureDir(path.dirname(options.output));
  fs.writeFileSync(options.output, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✅ HTML Generated: ${options.output} (${sizeKB} KB)`);

  if (sizeKB > 500) {
    console.warn(`⚠️  Warning: Output exceeds 500KB target (${sizeKB} KB). Consider reducing embedded assets.`);
  }
}

/** Escape HTML special characters for safe attribute/text embedding */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = buildHtml;
