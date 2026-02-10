const fs = require('fs');
const path = require('path');
const { processMarkdown } = require('../config');
const { ensureDir } = require('../utils/io');

function buildNative(lessonData, options) {
  console.log('📦 Building Native Bundle...');

  const outputDir = options.outputDir;
  ensureDir(outputDir);

  // 1. Create content directory and write step markdown files
  const contentDir = path.join(outputDir, 'content');
  ensureDir(contentDir);

  const cleanSteps = lessonData.steps.map((step, index) => {
    const stepFile = `step-${String(index + 1).padStart(2, '0')}.md`;
    if (step.content) {
      fs.writeFileSync(path.join(contentDir, stepFile), step.content);
    }
    return {
      ...step,
      content_src: `content/${stepFile}`,
      content: undefined
    };
  });

  // 2. Build manifest
  const manifest = {
    ...lessonData,
    steps: cleanSteps
  };

  // 3. Write lesson.json
  fs.writeFileSync(
    path.join(outputDir, 'lesson.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`✅ Native build complete: ${outputDir}`);
}

module.exports = buildNative;
