'use strict';

// Load and save approved lesson catalog. Used by governance APIs and theta for filtering.
// Schema: schemas/approved-catalog.schema.json

const path = require('path');
const { createSchemaStore } = require('./schema-store');
const log  = require('../utils/logger').createLogger('governance');
const envConfig = require('../utils/env-config');

const CATALOG_DEFAULTS = { lessonIds: [] };

const store = createSchemaStore({
  schemaPath: path.join(__dirname, '../../schemas', 'approved-catalog.schema.json'),
  defaults: CATALOG_DEFAULTS,
  log,
  preValidate: function (catalog) {
    if (!catalog || typeof catalog !== 'object') {
      return { valid: false, errors: ['Catalog must be an object'] };
    }
    if (!Array.isArray(catalog.lessonIds)) {
      return { valid: false, errors: ['lessonIds must be an array'] };
    }
    return { valid: true, errors: [] };
  }
});

function getCatalogPath() {
  return envConfig.approvedCatalog;
}

function validateCatalog(catalog) {
  return store.validate(catalog);
}

function loadCatalog(filePath) {
  return store.load(filePath || getCatalogPath());
}

function saveCatalog(catalog, filePath) {
  return store.save(catalog, filePath || getCatalogPath());
}

/**
 * Update catalog: add or remove lesson IDs.
 *
 * @param  {object} opts  { add?: string[], remove?: string[], lessonIds?: string[] }
 * @returns {{ ok: boolean, catalog?: object, error?: string }}
 */
function updateCatalog(opts) {
  const current = loadCatalog();
  let ids;
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
      const toRemove = new Set(opts.remove.map(String));
      ids = ids.filter(function (id) { return !toRemove.has(id); });
    }
  }
  const catalog = { lessonIds: ids };
  if (current.provenance) catalog.provenance = current.provenance;
  const saveResult = saveCatalog(catalog);
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
  const result = validateCatalog(imported);
  if (!result.valid) {
    return { ok: false, error: 'Imported catalog invalid: ' + result.errors.join('; ') };
  }
  const current = loadCatalog();
  let ids;
  switch (strategy) {
    case 'replace':
      ids = [...new Set(imported.lessonIds)];
      break;
    case 'merge':
      ids = [...new Set((current.lessonIds || []).concat(imported.lessonIds))];
      break;
    case 'add-only':
      const existing = new Set(current.lessonIds || []);
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
  const catalog = {
    lessonIds: ids,
    provenance: imported.provenance || { sourceAuthorityId: 'import', exportedAt: new Date().toISOString() }
  };
  const saveResult = saveCatalog(catalog);
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
