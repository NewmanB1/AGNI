'use strict';

// Load and save approved lesson catalog. Used by governance APIs and theta for filtering.
// Schema: schemas/approved-catalog.schema.json

var fs   = require('fs');
var path = require('path');
var log  = require('../utils/logger').createLogger('governance');

var schemaPath = path.join(__dirname, '../../schemas', 'approved-catalog.schema.json');
var Ajv;
try {
  Ajv = require('ajv');
} catch (e) {
  Ajv = null;
}

var validateCatalogSchema = null;
if (Ajv && fs.existsSync(schemaPath)) {
  try {
    var schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    validateCatalogSchema = new Ajv().compile(schema);
  } catch (err) {
    validateCatalogSchema = null;
  }
}

function getCatalogPath() {
  if (process.env.AGNI_APPROVED_CATALOG) return process.env.AGNI_APPROVED_CATALOG;
  var dataDir = process.env.AGNI_DATA_DIR || path.join(__dirname, '../../data');
  return path.join(dataDir, 'approved_catalog.json');
}

/**
 * Validate catalog object against approved-catalog schema.
 *
 * @param  {object} catalog
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') {
    return { valid: false, errors: ['Catalog must be an object'] };
  }
  if (!Array.isArray(catalog.lessonIds)) {
    return { valid: false, errors: ['lessonIds must be an array'] };
  }
  if (!validateCatalogSchema) return { valid: true, errors: [] };
  var ok = validateCatalogSchema(catalog);
  var errors = [];
  if (!ok && validateCatalogSchema.errors) {
    validateCatalogSchema.errors.forEach(function (err) {
      errors.push((err.instancePath || '') + ' ' + (err.message || ''));
    });
  }
  return { valid: errors.length === 0, errors: errors };
}

/**
 * Load approved catalog. Returns { lessonIds: [], provenance?: {} } or empty catalog if missing.
 *
 * @param  {string} [filePath]
 * @returns {object}
 */
function loadCatalog(filePath) {
  var p = filePath || getCatalogPath();
  if (!fs.existsSync(p)) return { lessonIds: [] };
  try {
    var raw = fs.readFileSync(p, 'utf8');
    var catalog = JSON.parse(raw);
    var result = validateCatalog(catalog);
    if (!result.valid) {
      log.warn('Catalog failed schema validation', { errors: result.errors });
      return { lessonIds: [] };
    }
    return catalog;
  } catch (err) {
    log.warn('Failed to load catalog', { filePath: p, error: err.message });
    return { lessonIds: [] };
  }
}

/**
 * Save catalog. Validates before writing.
 *
 * @param  {object} catalog  { lessonIds: string[], provenance?: {} }
 * @param  {string} [filePath]
 * @returns {{ ok: boolean, error?: string }}
 */
function saveCatalog(catalog, filePath) {
  var p = filePath || getCatalogPath();
  var result = validateCatalog(catalog);
  if (!result.valid) {
    return { ok: false, error: 'Catalog validation failed: ' + result.errors.join('; ') };
  }
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(catalog, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Update catalog: add or remove lesson IDs.
 *
 * @param  {object} opts  { add?: string[], remove?: string[], lessonIds?: string[] }
 *   - add: append these IDs (no duplicates)
 *   - remove: remove these IDs
 *   - lessonIds: replace entire set (ignores add/remove)
 * @returns {{ ok: boolean, catalog?: object, error?: string }}
 */
function updateCatalog(opts) {
  var current = loadCatalog();
  var ids;
  if (opts.lessonIds && Array.isArray(opts.lessonIds)) {
    ids = [...new Set(opts.lessonIds)];
  } else {
    ids = [...new Set(current.lessonIds || [])];
    if (Array.isArray(opts.add)) {
      opts.add.forEach(function (id) {
        if (typeof id === 'string' && id) ids.push(id);
      });
      ids = [...new Set(ids)];
    }
    if (Array.isArray(opts.remove)) {
      var toRemove = new Set(opts.remove.map(String));
      ids = ids.filter(function (id) { return !toRemove.has(id); });
    }
  }
  var catalog = { lessonIds: ids };
  if (current.provenance) catalog.provenance = current.provenance;
  var saveResult = saveCatalog(catalog);
  return saveResult.ok
    ? { ok: true, catalog: catalog }
    : { ok: false, error: saveResult.error };
}

/**
 * Import catalog from another authority. Resolves conflicts at import time.
 *
 * @param  {object} imported  { lessonIds: string[], provenance?: {} }
 * @param  {string} strategy  'replace' | 'merge' | 'add-only'
 * @returns {{ ok: boolean, catalog?: object, error?: string }}
 */
function importCatalog(imported, strategy) {
  var result = validateCatalog(imported);
  if (!result.valid) {
    return { ok: false, error: 'Imported catalog invalid: ' + result.errors.join('; ') };
  }
  var current = loadCatalog();
  var ids;
  switch (strategy) {
    case 'replace':
      ids = [...new Set(imported.lessonIds)];
      break;
    case 'merge':
      ids = [...new Set((current.lessonIds || []).concat(imported.lessonIds))];
      break;
    case 'add-only':
      var existing = new Set(current.lessonIds || []);
      ids = current.lessonIds ? [...current.lessonIds] : [];
      imported.lessonIds.forEach(function (id) {
        if (typeof id === 'string' && id && !existing.has(id)) {
          ids.push(id);
          existing.add(id);
        }
      });
      break;
    default:
      return { ok: false, error: 'strategy must be replace, merge, or add-only' };
  }
  var catalog = {
    lessonIds: ids,
    provenance: imported.provenance || { sourceAuthorityId: 'import', exportedAt: new Date().toISOString() }
  };
  var saveResult = saveCatalog(catalog);
  return saveResult.ok ? { ok: true, catalog: catalog } : { ok: false, error: saveResult.error };
}

module.exports = {
  loadCatalog: loadCatalog,
  saveCatalog: saveCatalog,
  updateCatalog: updateCatalog,
  importCatalog: importCatalog,
  validateCatalog: validateCatalog,
  getCatalogPath: getCatalogPath
};
