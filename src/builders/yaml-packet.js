// src/builders/yaml-packet.js
// AGNI YAML Packet Builder (Phase 6)
//
// Thin-client distribution format: original lesson YAML plus a small
// packet manifest. Clients that prefer to parse and render from YAML
// can use this packet instead of the JSON native bundle.
//
// Output:
//   lesson.yaml   — source OLS YAML (unchanged)
//   packet.json   — minimal manifest (identifier, title, schemaVersion, etc.)
//
// The sidecar (lesson-ir.json) is not written here; the compiler may
// write it for theta indexing when serving yaml-packets from the hub.

'use strict';

var fs = require('fs');
var path = require('path');
var ensureDir = require('../utils/io').ensureDir;

/**
 * Build YAML packet from raw YAML and IR/sidecar.
 *
 * @param {string} rawYaml   Original lesson YAML string
 * @param {object} ir       Full IR (for metadata)
 * @param {object} sidecar  Metadata-only sidecar from buildLessonSidecar(ir)
 * @param {object} options  { outputDir }
 */
function buildYamlPacket(rawYaml, ir, sidecar, options) {
  var outputDir = options.outputDir;
  ensureDir(outputDir);

  fs.writeFileSync(path.join(outputDir, 'lesson.yaml'), rawYaml, 'utf8');

  var packet = {
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

  console.log('✅ YAML packet build complete: ' + outputDir);
}

module.exports = { buildYamlPacket };
