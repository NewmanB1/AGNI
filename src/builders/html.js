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
  const dataString = JSON.stringify(runtimeData);
  const signature = signContent(dataString, options.deviceId, options.privateKey);

  // 4. Safe data injection
  const safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // Inline svgGenerators (from svgLibrary.js) to avoid import/404
  const svgGeneratorsInline = `
    const svgGenerators = {
      circle: (props) => \`<circle cx="\${props.cx}" cy="\${props.cy}" r="\${props.r}" fill="\${props.fill}" />\`,
      rect: (props) => \`<rect x="\${props.x}" y="\${props.y}" width="\${props.width}" height="\${props.height}" fill="\${props.fill}" />\`,
      line: (props) => \`<line x1="\${props.x1}" y1="\${props.y1}" x2="\${props.x2}" y2="\${props.y2}" stroke="\${props.stroke}" stroke-width="\${props.width}" />\`,
      // Add any other generators you have in svgLibrary.js here
      // e.g. path, polygon, text, etc.
    };
  `;

  // 5. Final embedded script
  const finalScript = `
    ${svgGeneratorsInline}
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

  // 6. Assembly
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
  <div id="loading">Loading lesson...</div>
  <div id="app"></div>
  <script type="module">
    ${finalScript}
  </script>
</body>
</html>`;

  ensureDir(path.dirname(options.output));
  fs.writeFileSync(options.output, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✅ HTML Generated: ${options.output} (${sizeKB} KB)`);
  if (sizeKB > 500) {
    console.warn(`⚠️ Warning: Output exceeds 500KB target (${sizeKB} KB). Consider reducing embedded assets.`);
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
