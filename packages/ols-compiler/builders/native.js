const fs = require('fs');
const path = require('path');
const { ensureDir } = require('@agni/utils/io');
const { createLogger } = require('@agni/utils/logger');

const log = createLogger('native-builder');

function buildNative(ir, options) {
  log.info('Building Native Bundle...');

  const outputDir = options.outputDir;
  ensureDir(outputDir);

  const contentDir = path.join(outputDir, 'content');
  ensureDir(contentDir);

  const cleanSteps = (ir.steps || []).map((step, index) => {
    const stepFile = `step-${String(index + 1).padStart(2, '0')}.md`;
    if (step.content) {
      fs.writeFileSync(path.join(contentDir, stepFile), step.content);
    }
    const { content, htmlContent, ...rest } = step;
    return Object.assign({}, rest, { content_src: `content/${stepFile}` });
  });

  const manifest = {
    version: ir.version,
    meta: ir.meta,
    ontology: ir.ontology,
    gate: ir.gate,
    steps: cleanSteps,
    inferredFeatures: ir.inferredFeatures,
    _compiledAt: ir._compiledAt,
    _schemaVersion: ir._schemaVersion
  };

  fs.writeFileSync(
    path.join(outputDir, 'lesson.json'),
    JSON.stringify(manifest, null, 2)
  );

  log.info(`Native build complete: ${outputDir}`);
}

module.exports = buildNative;
