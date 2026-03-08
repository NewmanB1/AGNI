'use strict';

const { createLogger } = require('@agni/utils/logger');
const log = createLogger('compiler');

const inferFeatures  = require('@agni/utils/feature-inference').inferFeatures;
const archetypeMatch = require('@agni/utils/archetype-match');
const config         = require('../markdown-pipeline');

async function buildLessonIR(lessonData, options) {
  options = options || {};

  const inferenceResult  = inferFeatures(lessonData);
  const inferredFeatures = inferenceResult.inferredFeatures;
  const metadataSource   = inferenceResult.metadata_source;

  const coherenceResult = archetypeMatch.validateCoherence(
    Object.assign({}, lessonData, { inferredFeatures: inferredFeatures })
  );
  inferredFeatures.archetypeId = coherenceResult.archetypeId;
  inferredFeatures.coherence   = coherenceResult.coherence;
  if (coherenceResult.warnings.length > 0) {
    coherenceResult.warnings.forEach(function (w) { log.warn(w); });
  }

  const NUMERIC_PARAM_KEYS = [
    'length', 'width', 'height', 'w', 'h', 'value', 'min', 'max', 'r', 'radius',
    'x', 'y', 'sides', 'ticks', 'speed', 'opacity', 'fillOpacity', 'scale',
    'minValue', 'maxValue', 'bob_radius', 'strokeWidth'
  ];

  const steps = await Promise.all(
    (lessonData.steps || []).map(async function (step) {
      let htmlContent = '';
      if (step.content) {
        try {
          htmlContent = await config.processMarkdown(step.content);
        } catch (err) {
          log.error(
            'Markdown failed for step', step.id || '(no id)', ':', err.message
          );
          htmlContent = step.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\n/g, '<br>');
        }
      }
      var out = Object.assign({}, step, { htmlContent: htmlContent });
      var spec = step.svg_spec || step.spec;
      if (spec && spec.opts && typeof spec.opts === 'object') {
        NUMERIC_PARAM_KEYS.forEach(function (key) {
          if (!(key in spec.opts)) return;
          var v = spec.opts[key];
          if (v !== null && v !== undefined && typeof v !== 'number' && typeof v !== 'boolean') {
            var n = parseFloat(v);
            if (isNaN(n)) {
              log.warn('AUDIT-E1: svg_spec opts.' + key + ' non-numeric (may crash runtime)', {
                stepId: step.id, value: v
              });
            }
          }
        });
      }
      return out;
    })
  );

  const meta = lessonData.meta || {};
  const yamlSchemaVersion = meta.yamlSchemaVersion;
  const KNOWN_SCHEMA_VERSIONS = ['1.6.0', '1.7.0', '1.8.0'];
  if (yamlSchemaVersion && KNOWN_SCHEMA_VERSIONS.indexOf(yamlSchemaVersion) === -1) {
    log.warn(
      'yamlSchemaVersion "' + yamlSchemaVersion + '" not in known set [' +
      KNOWN_SCHEMA_VERSIONS.join(', ') + ']; continuing with best-effort parse'
    );
  }

  const ir = Object.assign({}, lessonData, {
    steps:            steps,
    inferredFeatures: inferredFeatures,
    metadata_source:  metadataSource,
    _devMode:         options.dev === true,
    _compiledAt:      new Date().toISOString(),
    _schemaVersion:   lessonData.schema_version || lessonData.schemaVersion ||
                      yamlSchemaVersion || lessonData.version || '1.8.0',
    featureFlags:     options.featureFlags || {}
  });

  return ir;
}

function buildLessonSidecar(ir) {
  const meta     = ir.meta     || {};
  const ontology = ir.ontology || {};

  return {
    identifier:     ir.identifier || meta.identifier || '',
    slug:           ir.slug       || meta.slug       || '',
    title:          meta.title    || ir.title        || '',
    language:       meta.language || ir.language     || 'en',
    difficulty:     (ir.inferredFeatures.difficulty != null ? ir.inferredFeatures.difficulty : (meta.difficulty != null ? meta.difficulty : 2)),
    uri:            meta.uri || undefined,
    content_hash:   meta.content_hash || undefined,
    parent_hash:    meta.parent_hash || undefined,
    creator_id:     meta.creator_id || undefined,

    utu:            meta.utu || undefined,
    teaching_mode:  meta.teaching_mode || ir.teaching_mode || undefined,
    is_group:       !!(meta.is_group),

    compiledAt:     ir._compiledAt,
    schemaVersion:  ir._schemaVersion,
    yamlSchemaVersion: (ir.meta && ir.meta.yamlSchemaVersion) || undefined,
    metadata_source: ir.metadata_source,

    ontology: {
      requires: (ontology.requires || []).map(function (r) {
        return typeof r === 'string' ? { skill: r } : r;
      }),
      provides: (ontology.provides || []).map(function (p) {
        return typeof p === 'string' ? { skill: p, level: 1 } : p;
      })
    },
    gate: ir.gate || null,

    inferredFeatures: ir.inferredFeatures,
    katexAssets:      ir.inferredFeatures.katexAssets     || [],
    factoryManifest:  ir.inferredFeatures.factoryManifest || []
  };
}

module.exports = {
  buildLessonIR,
  buildLessonSidecar
};
