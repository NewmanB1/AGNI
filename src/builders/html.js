const fs = require('fs');
const path = require('path');
const { signContent } = require('../utils/crypto');
const { ensureDir } = require('../utils/io');

// Import config async methods
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
            console.error(`Markdown processing failed for step ${step.id}:`, err.message);
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

  // 2. Read source templates
  const runtimeJs = fs.readFileSync(path.join(__dirname, '../runtime/player.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../runtime/style.css'), 'utf8');

  // 3. Read shared svgLibrary.js (no longer hardcoded inlining)
  const svgLibraryPath = path.join(__dirname, '../runtime/svgLibrary.js');
  let svgLibraryCode = '';
  if (fs.existsSync(svgLibraryPath)) {
    svgLibraryCode = fs.readFileSync(svgLibraryPath, 'utf8');
    console.log(`Injected shared svgLibrary.js from ${svgLibraryPath}`);
  } else {
    console.warn("svgLibrary.js not found – SVG generation may not work in runtime");
  }

  // 4. Serialize & Sign
  const dataString = JSON.stringify(runtimeData);
  const signature = signContent(dataString, options.deviceId, options.privateKey);

  // 5. Safe data injection (escape </script>)
  const safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // 6. Final embedded script – now includes svgLibrary + player
  const finalScript = `
    ${svgLibraryCode}  // shared svgGenerators

    window.LESSON_DATA = ${safeDataString};
    window.OLS_SIGNATURE = ${JSON.stringify(signature || '')};
    window.OLS_INTENDED_OWNER = ${JSON.stringify(options.deviceId || '')};

    ${runtimeJs}

    // Safety net: hide loading if init fails
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
      }, 5000); // 5 second timeout fallback
    });
  `;

  // 7. Assembly
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
  <script type="module">
    ${finalScript}
  </script>
</body>
</html>`;

  // Write output
  ensureDir(path.dirname(options.output));
  fs.writeFileSync(options.output, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✅ HTML Generated: ${options.output} (${sizeKB} KB)`);

  if (parseFloat(sizeKB) > 500) {
    console.warn(`⚠️ Warning: Output exceeds 500KB target (${sizeKB} KB). Consider optimizing content.`);
  }
}

/** Escape HTML special characters for safe attribute/text embedding */
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
