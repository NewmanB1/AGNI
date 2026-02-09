const fs = require('fs');
const path = require('path');
const { processMarkdown } = require('../config');
const { signContent } = require('../utils/crypto');
const { ensureDir } = require('../utils/io');

function buildHtml(lessonData, options) {
  console.log(`🌍 Building HTML for Device: ${options.deviceId || 'Unbound'}`);

  // 1. Process Markdown
  const runtimeData = {
    ...lessonData,
    steps: lessonData.steps.map(step => ({
      ...step,
      htmlContent: processMarkdown(step.content)
    }))
  };

  // 2. Read Source Templates
  const runtimeJs = fs.readFileSync(path.join(__jkdir, '../runtime/player.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../runtime/style.css'), 'utf8');

  // 3. Serialize & Sign
  const dataString = JSON.stringify(runtimeData);
  const signature = signContent(dataString, options.deviceId, options.privateKey);

  // 4. Injection
  // We prepend the dynamic data variables to the static JS code
  const finalScript = `
    window.LESSON_DATA = ${dataString};
    const SIGNATURE = "${signature || ''}";
    const INTENDED_OWNER = "${options.deviceId || ''}";
    
    ${runtimeJs}
  `;

  // 5. Assembly
  const html = `
    <!DOCTYPE html>
    <html lang="${lessonData.meta.language}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${lessonData.meta.title}</title>
      <style>${styles}</style>
    </head>
    <body>
      <div id="app"></div>
      <script>${finalScript}</script>
    </body>
    </html>
  `;

  ensureDir(path.dirname(options.output));
  fs.writeFileSync(options.output, html);
  console.log(`✅ HTML Generated: ${options.output}`);
}

module.exports = buildHtml;
