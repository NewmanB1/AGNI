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
      return Object.assign({}, step, { htmlContent: htmlContent });
    })
  );

  const ir = Object.assign({}, lessonData, {
    steps:            steps,
    inferredFeatures: inferredFeatures,
    metadata_source:  metadataSource,
    _devMode:         options.dev === true,
    _compiledAt:      new Date().toISOString(),
    _schemaVersion:   lessonData.schema_version || lessonData.schemaVersion || '1.8.0',
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
