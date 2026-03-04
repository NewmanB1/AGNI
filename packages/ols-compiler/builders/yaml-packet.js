'use strict';

const fs = require('fs');
const path = require('path');
const ensureDir = require('@agni/utils/io').ensureDir;
const { createLogger } = require('@agni/utils/logger');

const log = createLogger('yaml-packet');

function buildYamlPacket(rawYaml, ir, sidecar, options) {
  const outputDir = options.outputDir;
  ensureDir(outputDir);

  fs.writeFileSync(path.join(outputDir, 'lesson.yaml'), rawYaml, 'utf8');

  const packet = {
    identifier: sidecar.identifier,
    title: sidecar.title,
    language: sidecar.language,
    schemaVersion: sidecar.schemaVersion,
    compiledAt: sidecar.compiledAt,
    ontology: sidecar.ontology,
    difficulty: sidecar.difficulty
  };

  fs.writeFileSync(
    path.join(outputDir, 'packet.json'),
    JSON.stringify(packet, null, 2)
  );

  log.info('YAML packet build complete: ' + outputDir);
}

module.exports = { buildYamlPacket };
