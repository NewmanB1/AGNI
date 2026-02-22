// src/compiler/buildLessonIR.js
// AGNI Lesson IR Builder  v1.0.0
//
// Builds the canonical Intermediate Representation (IR) for a parsed OLS
// lesson. The IR is the single source of truth consumed by all builders:
//
//   html.js        — compiles to lesson HTML for the village hub
//   native.js      — compiles to compact packet for thin clients (Phase 6)
//   yaml-packet.js — thin-client YAML renderer (Phase 6)
//
// The IR is NOT format-specific. It contains everything a builder needs
// and nothing a builder should decide — format decisions (inlining,
// signing, KaTeX link tags) belong in the builders, not here.
//
// Two outputs are produced:
//
//   1. Full IR  — passed to html.js for compilation into lesson HTML.
//      Contains steps with pre-rendered htmlContent, all metadata,
//      compiler stamps, and inferredFeatures.
//
//   2. Sidecar (lesson-ir.json)  — written alongside the lesson HTML by
//      html.js. Metadata-only: no steps, no htmlContent. Read by the
//      theta engine to build its lesson index without scraping compiled
//      HTML with a regex.
//
// Design constraint — WYSIWYG integration path:
//   When the WYSIWYG lesson builder arrives, it will write structured
//   metadata directly into YAML packets (factory ids, equation domains,
//   pedagogical intent). The compiler will then verify rather than infer.
//   This is why metadata_source is tracked here and why inferredFeatures
//   has a clear distinction between declared and inferred fields.
//   Per-feature declared/inferred tracking is deferred to the WYSIWYG phase;
//   metadata_source is the top-level marker for now.
//
// Target: Node.js 14+. Not loaded on the edge device.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var inferFeatures = require('../utils/featureInference').inferFeatures;
var config        = require('../config');

/**
 * Builds the canonical lesson IR from a parsed OLS lesson object.
 *
 * Responsibilities:
 *   1. Run feature inference (validates declared metadata if present,
 *      infers from content if not — see featureInference.js)
 *   2. Pre-render Markdown content to HTML for each step in parallel
 *   3. Stamp compiler metadata (_devMode, _compiledAt, _schemaVersion,
 *      metadata_source)
 *   4. Return the full IR object
 *
 * The IR is NOT written to disk here. html.js receives it and decides
 * what to write: the full IR goes into the lesson HTML as LESSON_DATA,
 * and buildLessonSidecar() extracts the sidecar for lesson-ir.json.
 *
 * Markdown processing is parallelised across steps with Promise.all.
 * On a lesson with 20 steps this is meaningfully faster than sequential.
 *
 * @param  {object}  lessonData   parsed YAML lesson object
 * @param  {object}  options      CLI options: dev, inputFile
 * @returns {Promise<object>}     fully enriched IR object
 */
async function buildLessonIR(lessonData, options) {
  options = options || {};

  // ── 1. Feature inference ───────────────────────────────────────────────────
  // inferFeatures returns { inferredFeatures, metadata_source }.
  // If lessonData.inferredFeatures is already present (future WYSIWYG path),
  // inferFeatures verifies it and sets metadata_source to 'declared' or 'mixed'.
  var inferenceResult  = inferFeatures(lessonData);
  var inferredFeatures = inferenceResult.inferredFeatures;
  var metadataSource   = inferenceResult.metadata_source;

  // ── 2. Pre-render Markdown to HTML for each step ───────────────────────────
  // Done at build time so the runtime is pure innerHTML with no parsing cost.
  // Errors per step are caught individually — a bad step does not abort the
  // build; it falls back to line-break-separated plain text.
  var steps = await Promise.all(
    (lessonData.steps || []).map(async function (step) {
      var htmlContent = '';
      if (step.content) {
        try {
          htmlContent = await config.processMarkdown(step.content);
        } catch (err) {
          console.error(
            '[IR] Markdown failed for step', step.id || '(no id)', ':', err.message
          );
          // Graceful fallback: preserve line breaks, escape nothing else
          htmlContent = step.content.replace(/\n/g, '<br>');
        }
      }
      return Object.assign({}, step, { htmlContent: htmlContent });
    })
  );

  // ── 3. Stamp compiler metadata ─────────────────────────────────────────────
  // _devMode   — runtime reads this to set DEV_MODE (single source of truth)
  // _compiledAt — ISO timestamp of this compilation; recorded in sidecar so
  //   theta can detect stale index entries
  // _schemaVersion — OLS schema version from lesson YAML; preserved for
  //   forward-compatibility checks in future lesson player versions
  // metadata_source — 'inferred' until WYSIWYG writes explicit metadata
  var ir = Object.assign({}, lessonData, {
    steps:            steps,
    inferredFeatures: inferredFeatures,
    metadata_source:  metadataSource,
    _devMode:         options.dev === true,
    _compiledAt:      new Date().toISOString(),
    _schemaVersion:   lessonData.schema_version || lessonData.schemaVersion || '1.7.0'
  });

  return ir;
}


/**
 * Extracts the metadata-only sidecar object from a full IR.
 *
 * The sidecar is written to lesson-ir.json alongside the lesson HTML.
 * It contains everything the theta engine needs for lesson scheduling
 * and adaptive sequencing — ontology, inferredFeatures, gate — but
 * omits the steps array and htmlContent to keep the file small.
 *
 * Theta's rebuildLessonIndex() reads this file directly instead of
 * scraping window.LESSON_DATA out of compiled HTML with a regex.
 * The regex approach was fragile (broke on minification) and lossy
 * (only ontology fields were extracted; inferredFeatures were discarded).
 *
 * Fields present in the sidecar:
 *   identifier      — OLS lesson identifier (e.g. 'ols:physics:gravity_v1')
 *   slug            — URL slug used by the village hub
 *   title           — lesson title for display
 *   language        — BCP 47 language tag
 *   difficulty      — 1–5 numeric difficulty (from declaration or inference)
 *   compiledAt      — ISO timestamp of compilation
 *   schemaVersion   — OLS schema version
 *   metadata_source — 'inferred' | 'declared' | 'mixed'
 *   ontology        — { requires, provides } for theta skill graph
 *   gate            — prerequisite gate block (theta uses this for scheduling)
 *   inferredFeatures — full feature profile for adaptive sequencing
 *   katexAssets     — CSS files needed; factory-loader.js uses this list
 *   factoryManifest — SVG factory files needed; factory-loader.js uses this
 *
 * Fields NOT present in the sidecar:
 *   steps           — too large; not needed by theta
 *   htmlContent     — per-step rendered HTML; stays in lesson HTML only
 *   _devMode        — runtime-only flag; not relevant to theta
 *
 * @param  {object} ir   full IR object from buildLessonIR()
 * @returns {object}     metadata-only sidecar object
 */
function buildLessonSidecar(ir) {
  var meta     = ir.meta     || {};
  var ontology = ir.ontology || {};

  return {
    // ── Identity ─────────────────────────────────────────────────────────────
    identifier:     ir.identifier || meta.identifier || '',
    slug:           ir.slug       || meta.slug       || '',
    title:          meta.title    || ir.title        || '',
    language:       meta.language || ir.language     || 'en',
    difficulty:     ir.inferredFeatures.difficulty   || meta.difficulty || 2,

    // ── Compiler stamps ───────────────────────────────────────────────────────
    compiledAt:     ir._compiledAt,
    schemaVersion:  ir._schemaVersion,
    metadata_source: ir.metadata_source,

    // ── Curriculum / scheduling ───────────────────────────────────────────────
    ontology: {
      requires: (ontology.requires || []).map(function (r) {
        return typeof r === 'string' ? { skill: r } : r;
      }),
      provides: (ontology.provides || []).map(function (p) {
        return typeof p === 'string' ? { skill: p, level: 1 } : p;
      })
    },
    gate: ir.gate || null,

    // ── Feature profile ───────────────────────────────────────────────────────
    // Full inferredFeatures so theta can use pedagogical signals (VARK,
    // Bloom's ceiling, teaching style) for adaptive sequencing in later
    // versions. The flags and manifests are what factory-loader.js needs now.
    inferredFeatures: ir.inferredFeatures,
    katexAssets:      ir.inferredFeatures.katexAssets     || [],
    factoryManifest:  ir.inferredFeatures.factoryManifest || []
  };
}


module.exports = {
  buildLessonIR:      buildLessonIR,
  buildLessonSidecar: buildLessonSidecar
};
