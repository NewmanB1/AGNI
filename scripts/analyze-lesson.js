#!/usr/bin/env node
'use strict';

/**
 * Lesson static analysis tool.
 * Outputs: prerequisite depth, skill coverage, UTU distribution, VARK balance.
 *
 * Usage: node scripts/analyze-lesson.js <lesson.yaml> [--curriculum <path>]
 * Or:    agni analyze <lesson.yaml> [--curriculum <path>]
 */

const fs = require('fs');
const path = require('path');

async function run(inputPath, options) {
  options = options || {};
  const curriculumPath = options.curriculum;

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('Error: Lesson file not found:', inputPath);
    process.exit(1);
  }

  const compilerService = require('@ols/compiler/services/compiler');
  const { buildLessonIR, computeLessonIRHash } = require('@ols/compiler/compiler/build-lesson-ir');
  const envConfig = require('@agni/utils/env-config');

  const stat = fs.statSync(inputPath);
  const maxBytes = envConfig.yamlMaxBytes || 2 * 1024 * 1024;
  if (stat.size > maxBytes) {
    console.error('YAML file exceeds max size');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = compilerService.parseLessonFromString(raw, { maxBytes });
  if (parsed.error) {
    console.error('Parse error:', parsed.error);
    process.exit(1);
  }

  const lessonSchema = require('@ols/schema/lesson-schema');
  const schemaResult = lessonSchema.validateLessonData(parsed.lessonData);
  if (!schemaResult.valid) {
    console.error('Schema validation failed:');
    schemaResult.errors.forEach(function (e) { console.error('  ', e); });
    process.exit(1);
  }

  const ir = await buildLessonIR(parsed.lessonData, { dev: false });
  const meta = ir.meta || {};
  const ontology = ir.ontology || {};
  const inf = ir.inferredFeatures || {};

  const requires = (ontology.requires || []).map(function (r) {
    return typeof r === 'string' ? r : (r.skill || r);
  });
  const provides = (ontology.provides || []).map(function (p) {
    return typeof p === 'string' ? p : (p.skill || p);
  });

  // ── Prerequisite depth ──
  // For a single lesson: depth = length of requires chain. Without curriculum we report "requires count".
  const prereqDepth = requires.length;
  let maxChainDepth = prereqDepth;
  let curriculumLessons = [];
  if (curriculumPath && fs.existsSync(curriculumPath)) {
    try {
      var data = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
      curriculumLessons = Array.isArray(data) ? data : (data.lessons || []);
    } catch (_) {
      curriculumLessons = [];
    }
  }
  if (curriculumLessons.length > 0) {
    const skillGraph = {};
    curriculumLessons.forEach(function (l) {
      const sReq = (l.skillsRequired || l.ontology?.requires || []).map(function (r) {
        return typeof r === 'string' ? r : (r.skill || r);
      });
      (l.skillsProvided || l.ontology?.provides || []).forEach(function (p) {
        const skill = typeof p === 'string' ? p : (p.skill || p);
        if (!skillGraph[skill]) skillGraph[skill] = new Set();
        sReq.forEach(function (r) { skillGraph[skill].add(r); });
      });
    });
    function depthOf(skill, visited) {
      if (visited.has(skill)) return 0;
      visited.add(skill);
      const reqs = skillGraph[skill];
      if (!reqs || reqs.size === 0) return 1;
      var max = 0;
      reqs.forEach(function (r) {
        var d = depthOf(r, new Set(visited));
        if (d > max) max = d;
      });
      return 1 + max;
    }
    provides.forEach(function (s) {
      var d = depthOf(s, new Set());
      if (d > maxChainDepth) maxChainDepth = d;
    });
  }

  // ── UTU ──
  const utu = meta.utu || {};
  const utuClass = utu.class || '(none)';
  const utuBand = utu.band != null ? utu.band : '(none)';

  // ── VARK ──
  const vark = inf.vark || {};
  const varkSum = (vark.visual || 0) + (vark.auditory || 0) + (vark.readWrite || 0) + (vark.kinesthetic || 0);
  const varkNorm = varkSum > 0
    ? {
        visual: ((vark.visual || 0) / varkSum * 100).toFixed(1) + '%',
        auditory: ((vark.auditory || 0) / varkSum * 100).toFixed(1) + '%',
        readWrite: ((vark.readWrite || 0) / varkSum * 100).toFixed(1) + '%',
        kinesthetic: ((vark.kinesthetic || 0) / varkSum * 100).toFixed(1) + '%'
      }
    : { visual: '0%', auditory: '0%', readWrite: '0%', kinesthetic: '0%' };

  // ── Output ──
  const lessonHash = computeLessonIRHash(ir);

  console.log('');
  console.log('══ AGNI Lesson Analysis: ' + (meta.title || meta.identifier || inputPath) + ' ══');
  console.log('');
  console.log('Identity');
  console.log('  identifier:  ' + (meta.identifier || '(none)'));
  console.log('  slug:        ' + (meta.slug || '(none)'));
  console.log('  lessonHash:  ' + lessonHash);
  console.log('');
  console.log('Prerequisite depth');
  console.log('  direct requires:  ' + prereqDepth);
  console.log('  max chain depth:  ' + maxChainDepth + (curriculumLessons.length > 0 ? ' (from curriculum)' : ' (single lesson)'));
  console.log('');
  console.log('Skill coverage');
  console.log('  requires: ' + (requires.length ? requires.join(', ') : '(none)'));
  console.log('  provides: ' + (provides.length ? provides.join(', ') : '(none)'));
  console.log('');
  console.log('UTU distribution');
  console.log('  class:  ' + utuClass);
  console.log('  band:   ' + utuBand);
  console.log('  teaching_mode: ' + (meta.teaching_mode || '(none)'));
  console.log('');
  console.log('VARK balance');
  console.log('  visual:      ' + varkNorm.visual);
  console.log('  auditory:    ' + varkNorm.auditory);
  console.log('  read/write:  ' + varkNorm.readWrite);
  console.log('  kinesthetic: ' + varkNorm.kinesthetic);
  console.log('');
  console.log('Inferred features');
  console.log('  difficulty:    ' + (inf.difficulty != null ? inf.difficulty : '(none)'));
  console.log('  bloomsCeiling: ' + (inf.bloomsCeiling != null ? inf.bloomsCeiling : '(none)'));
  console.log('  archetypeId:   ' + (inf.archetypeId || '(none)'));
  console.log('  coherence:     ' + (inf.coherence != null ? inf.coherence.toFixed(3) : '(none)'));
  console.log('');
}

module.exports = { run };
