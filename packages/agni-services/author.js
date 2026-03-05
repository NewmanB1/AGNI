'use strict';

/**
 * Authoring API service: validate, preview and save lesson payloads (YAML or JSON).
 * Used by POST /api/author/validate, POST /api/author/preview, POST /api/author/save on the hub.
 * Phase 2 / Sprint K: uses shared lessonSchema so validation matches CLI and hub-transform.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const compilerService = require('./compiler');
const safeYamlLoad = compilerService.safeYamlLoad;
const buildIRWithSidecar = compilerService.buildIRWithSidecar;
const lessonSchema = require('./lesson-schema');
const lessonChain = require('./lesson-chain');
const envConfig = require('@agni/utils/env-config');

const DEFAULT_YAML_DIR = envConfig.yamlDir;

function sanitizeSlug(slug) {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '');
}

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
  const str = (typeof body === 'string' ? body : String(body)).trim();
  if (str.charAt(0) === '{') {
    try {
      return { lessonData: JSON.parse(str) };
    } catch (e) {
      return { error: 'Invalid JSON: ' + e.message };
    }
  }
  try {
    return { lessonData: safeYamlLoad(str) };
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
  const validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    return { error: 'Validation failed: ' + validation.errors.join('; ') };
  }
  try {
    return await buildIRWithSidecar(lessonData, { dev: true });
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
  const m = (lessonData.meta && typeof lessonData.meta === 'object') ? lessonData.meta : lessonData;
  const title = m.title || m.identifier || lessonData.title || lessonData.identifier || 'untitled';
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

  const m = (lessonData.meta && typeof lessonData.meta === 'object') ? lessonData.meta : lessonData;
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

  const validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    return { error: 'Validation failed: ' + validation.errors.join('; ') };
  }
  const slug = deriveSlug(lessonData);
  if (!slug) return { error: 'Cannot derive slug from lesson data' };

  const creatorId = m.creator_id || null;
  const contentHash = lessonChain.computeContentHash(lessonData);
  const latestVersion = await lessonChain.getLatestVersion(slug);
  const parentHash = latestVersion ? latestVersion.contentHash : null;
  const uri = creatorId ? lessonChain.buildUri(creatorId, slug) : null;

  if (lessonData.meta && typeof lessonData.meta === 'object') {
    lessonData.meta.content_hash = contentHash;
    lessonData.meta.parent_hash = parentHash;
    if (uri) lessonData.meta.uri = uri;
  }

  const dir = yamlDir || DEFAULT_YAML_DIR;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { error: 'Cannot create directory: ' + e.message };
  }

  const filePath = path.join(dir, slug + '.yaml');
  if (opts && opts.checkCollision && fs.existsSync(filePath) && !opts.overwrite) {
    return { error: 'A lesson with slug "' + slug + '" already exists. Use a different identifier or title.' };
  }

  try {
    const yamlStr = yaml.dump(lessonData, { lineWidth: 120, noRefs: true, sortKeys: false, schema: yaml.JSON_SCHEMA });
    fs.writeFileSync(filePath, yamlStr, 'utf8');
  } catch (e) {
    return { error: 'Write failed: ' + e.message };
  }

  if (!latestVersion || latestVersion.contentHash !== contentHash) {
    await lessonChain.appendVersion(slug, {
      contentHash: contentHash,
      parentHash: parentHash,
      creatorId: creatorId,
      uri: uri ? lessonChain.buildVersionUri(creatorId, slug, contentHash) : null,
      timestamp: new Date().toISOString()
    });
  }

  const result = {
    ok: true, slug: slug, path: filePath,
    warnings: validation.warnings || [],
    uri: uri || undefined,
    contentHash: contentHash,
    parentHash: parentHash
  };

  if (opts && opts.compile) {
    try {
      const compiled = await buildIRWithSidecar(lessonData, { dev: false });
      const irPath = path.join(dir, slug + '.ir.json');
      const sidecarPath = path.join(dir, slug + '.sidecar.json');
      fs.writeFileSync(irPath, JSON.stringify(compiled.ir, null, 2), 'utf8');
      fs.writeFileSync(sidecarPath, JSON.stringify(compiled.sidecar, null, 2), 'utf8');
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
  const dir = yamlDir || DEFAULT_YAML_DIR;
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
  const dir = yamlDir || DEFAULT_YAML_DIR;
  const safeName = sanitizeSlug(slug);
  const filePath = path.join(dir, safeName + '.yaml');
  if (!fs.existsSync(filePath)) {
    return { error: 'Lesson not found: ' + safeName };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = safeYamlLoad(raw);
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
  const dir = yamlDir || DEFAULT_YAML_DIR;
  const safeName = sanitizeSlug(slug);
  if (!safeName) return { error: 'Invalid slug' };
  const deleted = [];
  const extensions = ['.yaml', '.ir.json', '.sidecar.json'];
  for (let i = 0; i < extensions.length; i++) {
    const fp = path.join(dir, safeName + extensions[i]);
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
  const dir = yamlDir || DEFAULT_YAML_DIR;
  const safeName = sanitizeSlug(slug);
  return fs.existsSync(path.join(dir, safeName + '.yaml'));
}

/**
 * Generate a lesson draft using AI.
 * Caller must pass generateLesson (e.g. from scripts/generate-lesson). Requires AGNI_LLM_API_KEY.
 * Archetype hint is prepended to the skill description.
 * @param {{ skillDescription: string, archetypeId?: string, generateLesson?: function }}
 * @returns {Promise<{ ok: boolean, lesson?: object, error?: string }>}
 */
async function generateForAuthor({ skillDescription, archetypeId, generateLesson }) {
  const desc = (skillDescription || '').trim();
  if (!desc) return { ok: false, error: 'Skill description is required' };
  if (!generateLesson || typeof generateLesson !== 'function') {
    return { error: 'AI generation requires generateLesson to be passed by the caller (e.g. from scripts/generate-lesson).' };
  }
  if (!process.env.AGNI_LLM_API_KEY) {
    return { error: 'AI generation requires AGNI_LLM_API_KEY. Configure on the hub.' };
  }
  const fullDesc = archetypeId
    ? 'Pedagogical archetype: ' + archetypeId + '. ' + desc
    : desc;
  try {
    const result = await generateLesson(fullDesc, { verbose: false });
    const errs = (result.issues || []).filter((i) => i.severity === 'error');
    if (errs.length > 0) {
      return { ok: false, error: 'Generated lesson has validation errors: ' + errs.map((e) => e.message).join('; ') };
    }
    return { ok: true, lesson: result.lesson };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
  deriveSlug: deriveSlug,
  generateForAuthor: generateForAuthor
};
