const fs = require('fs');
const path = require('path');
const { signContent } = require('../utils/crypto');
const { ensureDir } = require('../utils/io');

// Import config async methods (no require() for ESM packages here)
const config = require('../config');

async function buildHtml(lessonData, options) {
  console.log(`🌍 Building HTML for Device: ${options.deviceId || 'Unbound (Development Mode)'}`);

  // 1. Process Markdown in each step (now async!)
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
            htmlContent = step.content.replace(/\n/g, '<br>'); // fallback: basic line breaks
          }
        }
        return {
          ...step,
          htmlContent
        };
      })
    )
  };

  // 2. Read Source Templates (unchanged)
  const runtimeJs = fs.readFileSync(path.join(__dirname, '../runtime/player.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../runtime/style.css'), 'utf8');

  // 3. Serialize & Sign (unchanged)
  const dataString = JSON.stringify(runtimeData);
  const signature = signContent(dataString, options.deviceId, options.privateKey);

  // 4. Safe data injection (prevent </script> breaking out)
  const safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // Inline svgGenerators (unchanged – good practice to avoid external fetches)
  const svgGeneratorsInline = `
    const svgGenerators = {
      circle: (props) => \`<circle cx="\${props.cx || 50}" cy="\${props.cy || 50}" r="\${props.r || 20}" fill="\${props.fill || 'blue'}" />\`,
      rect: (props) => \`<rect x="\${props.x || 0}" y="\${props.y || 0}" width="\${props.width || 100}" height="\${props.height || 100}" fill="\${props.fill || 'green'}" />\`,
      line: (props) => \`<line x1="\${props.x1 || 0}" y1="\${props.y1 || 0}" x2="\${props.x2 || 100}" y2="\${props.y2 || 100}" stroke="\${props.stroke || 'black'}" stroke-width="\${props.width || 2}" />\`,
      // Add more generators as needed (path, polygon, text, etc.)
    };
  `;

  // 5. Final embedded script (unchanged structure)
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

  // 6. Assembly (unchanged)
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
    console.warn(`⚠️ Warning: Output exceeds 500KB target (${sizeKB} KB). Consider optimizing content or splitting assets.`);
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
