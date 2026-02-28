'use strict';

/**
 * Authoring API service: validate, preview and save lesson payloads (YAML or JSON).
 * Used by POST /api/author/validate, POST /api/author/preview, POST /api/author/save on the hub.
 * Phase 2 / Sprint K: uses shared lessonSchema so validation matches CLI and hub-transform.
 */

var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var compiler = require('../compiler');
var buildLessonIR = compiler.buildLessonIR;
var buildLessonSidecar = compiler.buildLessonSidecar;
var lessonSchema = require('./lessonSchema');
var lessonChain = require('./lessonChain');

/**
 * Parse request body: YAML string or JSON string or object.
 * @param {string|object} body
 * @returns {{ lessonData: object }|{ error: string }}
 */
function parseAuthorBody(body) {
  if (body == null || body === '') {
    return { error: 'Request body is required' };
  }
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    return { lessonData: body };
  }
  var str = typeof body === 'string' ? body : String(body);
  str = str.trim();
  if (str.charAt(0) === '{') {
    try {
      return { lessonData: JSON.parse(str) };
    } catch (e) {
      return { error: 'Invalid JSON: ' + e.message };
    }
  }
  try {
    return { lessonData: yaml.load(str, { schema: yaml.JSON_SCHEMA }) };
  } catch (e) {
    return { error: 'Invalid YAML: ' + e.message };
  }
}

/**
 * Run schema + structure + threshold validation (shared with CLI and hub).
 * @param {object} lessonData
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateForAuthor(lessonData) {
  return lessonSchema.validateLessonData(lessonData);
}

/**
 * Build IR and sidecar for preview (no disk write).
 * Validates with shared schema before buildIR.
 * @param {object} lessonData  parsed lesson
 * @returns {Promise<{ ir: object, sidecar: object }|{ error: string }>}
 */
async function previewForAuthor(lessonData) {
  if (!lessonData || typeof lessonData !== 'object') {
    return { error: 'Invalid payload: must be an object' };
  }
  var validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    return { error: 'Validation failed: ' + validation.errors.join('; ') };
  }
  try {
    var ir = await buildLessonIR(lessonData, { dev: true });
    var sidecar = buildLessonSidecar(ir);
    return { ir: ir, sidecar: sidecar };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Derive a filesystem-safe slug from lesson data.
 * @param {object} lessonData
 * @returns {string}
 */
function deriveSlug(lessonData) {
  if (lessonData.slug && typeof lessonData.slug === 'string') {
    return lessonData.slug.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  var m = (lessonData.meta && typeof lessonData.meta === 'object') ? lessonData.meta : lessonData;
  var title = m.title || m.identifier || lessonData.title || lessonData.identifier || 'untitled';
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Save lesson data to disk as YAML. Validates first; writes to yamlDir/<slug>.yaml.
 * @param {object} lessonData  parsed lesson object (JSON or from YAML parse)
 * @param {string} yamlDir     target directory (e.g. process.env.AGNI_YAML_DIR || 'data/yaml')
 * @param {object} [opts]      options — { compile: boolean } triggers IR/sidecar generation on save
 * @returns {Promise<{ ok: boolean, slug: string, path: string, compiled?: boolean, warnings?: string[] }|{ error: string }>}
 */
async function saveLesson(lessonData, yamlDir, opts) {
  if (!lessonData || typeof lessonData !== 'object') {
    return { error: 'Invalid payload: must be an object' };
  }

  var m = (lessonData.meta && typeof lessonData.meta === 'object') ? lessonData.meta : lessonData;
  if (!m.updated) {
    if (lessonData.meta && typeof lessonData.meta === 'object') {
      lessonData.meta.updated = new Date().toISOString();
    }
  }
  if (!m.created) {
    if (lessonData.meta && typeof lessonData.meta === 'object') {
      lessonData.meta.created = new Date().toISOString();
    }
  }

  var validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    return { error: 'Validation failed: ' + validation.errors.join('; ') };
  }
  var slug = deriveSlug(lessonData);
  if (!slug) return { error: 'Cannot derive slug from lesson data' };

  // ── Compute content hash and build URI / chain ──────────────────────────
  var creatorId = m.creator_id || null;
  var contentHash = lessonChain.computeContentHash(lessonData);
  var latestVersion = lessonChain.getLatestVersion(slug);
  var parentHash = latestVersion ? latestVersion.contentHash : null;

  // Build the canonical URI (requires creator_id)
  var uri = creatorId ? lessonChain.buildUri(creatorId, slug) : null;

  // Stamp chain fields onto meta before writing
  if (lessonData.meta && typeof lessonData.meta === 'object') {
    lessonData.meta.content_hash = contentHash;
    lessonData.meta.parent_hash = parentHash;
    if (uri) lessonData.meta.uri = uri;
  }

  var dir = yamlDir || path.join(process.cwd(), 'data', 'yaml');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { error: 'Cannot create directory: ' + e.message };
  }

  var filePath = path.join(dir, slug + '.yaml');
  var existingPath = path.join(dir, slug + '.yaml');
  if (opts && opts.checkCollision && fs.existsSync(existingPath) && !opts.overwrite) {
    return { error: 'A lesson with slug "' + slug + '" already exists. Use a different identifier or title.' };
  }

  try {
    var yamlStr = yaml.dump(lessonData, { lineWidth: 120, noRefs: true, sortKeys: false, schema: yaml.JSON_SCHEMA });
    fs.writeFileSync(filePath, yamlStr, 'utf8');
  } catch (e) {
    return { error: 'Write failed: ' + e.message };
  }

  // Append to the hash chain (skip if content unchanged from latest)
  if (!latestVersion || latestVersion.contentHash !== contentHash) {
    lessonChain.appendVersion(slug, {
      contentHash: contentHash,
      parentHash: parentHash,
      creatorId: creatorId,
      uri: uri ? lessonChain.buildVersionUri(creatorId, slug, contentHash) : null,
      timestamp: new Date().toISOString()
    });
  }

  var result = {
    ok: true, slug: slug, path: filePath,
    warnings: validation.warnings || [],
    uri: uri || undefined,
    contentHash: contentHash,
    parentHash: parentHash
  };

  if (opts && opts.compile) {
    try {
      var ir = await buildLessonIR(lessonData, { dev: false });
      var sidecar = buildLessonSidecar(ir);
      var irPath = path.join(dir, slug + '.ir.json');
      var sidecarPath = path.join(dir, slug + '.sidecar.json');
      fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
      fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
      result.compiled = true;
      result.irPath = irPath;
      result.sidecarPath = sidecarPath;
    } catch (compileErr) {
      result.warnings = (result.warnings || []).concat(['Compile-on-save failed: ' + compileErr.message]);
      result.compiled = false;
    }
  }

  return result;
}

/**
 * List saved lesson YAML files in yamlDir.
 * @param {string} yamlDir
 * @returns {string[]} array of slugs (filename without .yaml)
 */
function listSavedLessons(yamlDir) {
  var dir = yamlDir || path.join(process.cwd(), 'data', 'yaml');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function(f) { return f.endsWith('.yaml'); })
    .map(function(f) { return f.replace(/\.yaml$/, ''); });
}

/**
 * Load a saved lesson YAML from disk and return parsed JSON.
 * @param {string} slug
 * @param {string} yamlDir
 * @returns {{ lessonData: object, raw: string }|{ error: string }}
 */
function loadLesson(slug, yamlDir) {
  var dir = yamlDir || path.join(process.cwd(), 'data', 'yaml');
  var safeName = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  var filePath = path.join(dir, safeName + '.yaml');
  if (!fs.existsSync(filePath)) {
    return { error: 'Lesson not found: ' + safeName };
  }
  try {
    var raw = fs.readFileSync(filePath, 'utf8');
    var parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    if (!parsed || typeof parsed !== 'object') {
      return { error: 'YAML parsed to non-object' };
    }
    return { lessonData: parsed, raw: raw };
  } catch (e) {
    return { error: 'Failed to read/parse: ' + e.message };
  }
}

/**
 * Delete a saved lesson YAML (and any compiled artifacts) from disk.
 * @param {string} slug
 * @param {string} yamlDir
 * @returns {{ ok: boolean, deleted: string[] }|{ error: string }}
 */
function deleteLesson(slug, yamlDir) {
  var dir = yamlDir || path.join(process.cwd(), 'data', 'yaml');
  var safeName = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) return { error: 'Invalid slug' };
  var deleted = [];
  var extensions = ['.yaml', '.ir.json', '.sidecar.json'];
  for (var i = 0; i < extensions.length; i++) {
    var fp = path.join(dir, safeName + extensions[i]);
    if (fs.existsSync(fp)) {
      try {
        fs.unlinkSync(fp);
        deleted.push(fp);
      } catch (e) {
        return { error: 'Failed to delete ' + fp + ': ' + e.message };
      }
    }
  }
  if (deleted.length === 0) {
    return { error: 'Lesson not found: ' + safeName };
  }
  return { ok: true, deleted: deleted };
}

/**
 * Check whether a slug already exists on disk.
 * @param {string} slug
 * @param {string} yamlDir
 * @returns {boolean}
 */
function slugExists(slug, yamlDir) {
  var dir = yamlDir || path.join(process.cwd(), 'data', 'yaml');
  var safeName = slug.replace(/[^a-zA-Z0-9_-]/g, '');
  return fs.existsSync(path.join(dir, safeName + '.yaml'));
}

module.exports = {
  parseAuthorBody: parseAuthorBody,
  validateForAuthor: validateForAuthor,
  previewForAuthor: previewForAuthor,
  saveLesson: saveLesson,
  loadLesson: loadLesson,
  listSavedLessons: listSavedLessons,
  deleteLesson: deleteLesson,
  slugExists: slugExists,
  deriveSlug: deriveSlug
};
