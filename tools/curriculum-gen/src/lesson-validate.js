'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const lessonValidator = require('@ols/schema/lesson-validator');
const lessonSchema = require('@ols/schema/lesson-schema');

/**
 * Parse and validate a generated YAML string.
 * Returns { valid, lesson, errors, warnings, features }
 */
function validateYaml(yamlStr, lessonSpec) {
  const result = {
    valid: false,
    lesson: null,
    errors: [],
    warnings: [],
    gapAnalysis: null,
    features: {
      stepTypes: [],
      factories: [],
      sensors: [],
      hasGate: false,
      hasBranching: false,
      hasAudioDescription: false,
      hasSvgDescription: false
    }
  };

  // Strip markdown fences if LLM wrapped it
  let cleaned = yamlStr;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:yaml|yml)?\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Parse YAML
  let lesson;
  try {
    lesson = YAML.parse(cleaned);
  } catch (e) {
    result.errors.push('YAML parse error: ' + e.message);
    return result;
  }

  if (!lesson || typeof lesson !== 'object') {
    result.errors.push('Parsed YAML is not an object');
    return result;
  }

  // Extract and preserve _gap_analysis before schema validation strips it
  if (lesson._gap_analysis) {
    result.gapAnalysis = lesson._gap_analysis;
    delete lesson._gap_analysis;
  }

  result.lesson = lesson;

  // Basic structure checks
  if (!lesson.version) result.errors.push('Missing "version" field');
  if (!lesson.meta) result.errors.push('Missing "meta" field');
  if (!lesson.steps || !Array.isArray(lesson.steps)) result.errors.push('Missing or invalid "steps" field');

  if (result.errors.length > 0) return result;

  // Run OLS schema validation
  try {
    const schemaResult = lessonSchema.validate(lesson);
    if (schemaResult && schemaResult.errors) {
      schemaResult.errors.forEach(function (e) {
        result.errors.push('Schema: ' + e);
      });
    }
  } catch (e) {
    // lessonSchema might not have a validate function — use the validator instead
  }

  // Run lesson validator
  try {
    const vResult = lessonValidator.validate(lesson);
    if (vResult.errors) {
      vResult.errors.forEach(function (e) {
        result.errors.push('Validator: ' + e);
      });
    }
    if (vResult.warnings) {
      vResult.warnings.forEach(function (w) {
        result.warnings.push('Validator: ' + w);
      });
    }
  } catch (e) {
    result.warnings.push('Validator threw: ' + e.message);
  }

  // Extract features for coverage tracking
  const steps = lesson.steps || [];
  const stepTypeSet = new Set();
  const factorySet = new Set();
  const sensorSet = new Set();
  const stepIds = new Set();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (!step.id) {
      result.errors.push('Step ' + i + ' missing id');
    } else if (stepIds.has(step.id)) {
      result.errors.push('Duplicate step id: ' + step.id);
    } else {
      stepIds.add(step.id);
    }

    if (!/^[a-z0-9_-]+$/.test(step.id || '')) {
      result.errors.push('Invalid step id format: "' + step.id + '" (must be ^[a-z0-9_-]+$)');
    }

    if (step.type) stepTypeSet.add(step.type);

    if (step.svg_spec && step.svg_spec.factory) {
      factorySet.add(step.svg_spec.factory);
      if (step.svg_spec.description) result.features.hasSvgDescription = true;
    }

    if (step.sensor) sensorSet.add(step.sensor);
    if (step.audio_description) result.features.hasAudioDescription = true;
    if (step.on_fail || step.on_success) result.features.hasBranching = true;
  }

  result.features.stepTypes = Array.from(stepTypeSet);
  result.features.factories = Array.from(factorySet);
  result.features.sensors = Array.from(sensorSet);
  result.features.hasGate = !!lesson.gate;

  // Check if step pattern roughly matches archetype
  if (lessonSpec) {
    const actualTypes = steps.map(function (s) { return s.type; });
    const expectedPattern = lessonSpec.stepPattern;

    if (actualTypes.length < expectedPattern.length) {
      result.warnings.push(
        'Step count (' + actualTypes.length + ') less than archetype pattern (' + expectedPattern.length + ')'
      );
    }

    for (let i = 0; i < Math.min(actualTypes.length, expectedPattern.length); i++) {
      const expected = expectedPattern[i].split('|');
      if (!expected.includes(actualTypes[i])) {
        result.warnings.push(
          'Step ' + i + ' type "' + actualTypes[i] + '" does not match pattern "' + expectedPattern[i] + '"'
        );
      }
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

module.exports = { validateYaml };
