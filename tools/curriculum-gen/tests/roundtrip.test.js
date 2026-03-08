'use strict';

const { describe, it } = require('../../../tests/helpers/test-api');
const assert = require('node:assert/strict');
const { validateYaml } = require('../src/lesson-validate');
const { buildPrompt } = require('../src/prompt-builder');

const SAMPLE_LESSON = `
version: "1.8.0"
meta:
  identifier: "ols:math:addition_within_10_v1"
  title: "Addition Within 10"
  description: "Learn to add numbers within 10 using a number line."
  language: "en"
  license: "CC-BY-SA-4.0"
  created: "2026-03-01T00:00:00Z"
  difficulty: 1
  teaching_mode: guided_discovery
  tags: ["addition", "counting", "number-line"]
  subject: ["Mathematics"]
  audience:
    educational_role: student
    typical_age_range: "5-6"
  time_required: "PT8M"
  utu:
    class: "MAC-1"
    band: 1
    protocol: 2
ontology:
  requires: []
  provides:
    - skill: "ols:math:addition_within_10"
      level: 1
steps:
  - id: intro
    type: instruction
    content: "Today we will learn to add numbers up to 10! Addition means putting numbers together."
    audio_description: "Today we will learn to add numbers up to ten. Addition means putting numbers together."
    svg_spec:
      factory: numberLine
      description: "A number line from 0 to 10 with all numbers marked"
      opts:
        title: "Number Line"
        w: 400
        h: 100
        min: 0
        max: 10
        step: 1

  - id: demo
    type: instruction
    content: "Let's try 3 + 2. Start at 3 on the number line, then jump 2 spaces forward. Where do you land? 5!"
    audio_description: "Let's try three plus two. Start at three on the number line, then jump two spaces forward. Where do you land? Five!"

  - id: quiz-1
    type: quiz
    content: "What is 4 + 3?"
    answer_options: ["5", "6", "7", "8"]
    correct_index: 2
    max_attempts: 2
    weight: 0.8
    feedback:
      correct: "That's right! 4 + 3 = 7. You jumped 3 spaces from 4."
      incorrect: "Not quite. Start at 4 and count 3 more: 5, 6, 7."

  - id: practice
    type: fill_blank
    content: "2 + ___ = 5"
    blanks:
      - answer: "3"
        accept: ["three"]
    max_attempts: 2
    feedback:
      correct: "Yes! 2 + 3 = 5."
      incorrect: "The answer is 3. Start at 2 and count up to 5: that's 3 jumps."

  - id: match-it
    type: matching
    content: "Match each addition problem to its answer."
    pairs:
      - left: "1 + 1"
        right: "2"
      - left: "2 + 3"
        right: "5"
      - left: "4 + 4"
        right: "8"
    max_attempts: 2
    feedback:
      correct: "All matched correctly!"
      incorrect: "Some matches were wrong. Remember to count on the number line."

  - id: done
    type: completion
    content: "Great work! You learned how to add numbers up to 10 using a number line."
`;

const SAMPLE_WITH_GAP = `
version: "1.8.0"
meta:
  identifier: "ols:math:test_v1"
  title: "Test Lesson"
  language: "en"
  license: "CC-BY-SA-4.0"
  created: "2026-03-01T00:00:00Z"
steps:
  - id: intro
    type: instruction
    content: "Hello"
  - id: done
    type: completion
    content: "Done"
_gap_analysis:
  wished_factories:
    - id: histogram
      reason: "Would allow displaying frequency distributions"
      workaround: "Used barGraph instead"
  wished_step_types:
    - id: drawing
      reason: "Students could sketch their answers"
  wished_sensors: []
  wished_svg_opts: []
  wished_schema_fields: []
  pedagogical_limitations:
    - "Cannot embed video for visual learners"
  accessibility_gaps:
    - "No support for sign language avatar"
`;

describe('lesson-validate roundtrip', function () {
  it('validates a well-formed lesson', function () {
    const result = validateYaml(SAMPLE_LESSON, null);
    assert.equal(result.valid, true, 'Expected valid but got errors: ' + JSON.stringify(result.errors));
    assert.equal(result.features.stepTypes.length, 5);
    assert.ok(result.features.stepTypes.includes('instruction'));
    assert.ok(result.features.stepTypes.includes('quiz'));
    assert.ok(result.features.stepTypes.includes('fill_blank'));
    assert.ok(result.features.stepTypes.includes('matching'));
    assert.ok(result.features.stepTypes.includes('completion'));
    assert.ok(result.features.factories.includes('numberLine'));
    assert.equal(result.features.hasAudioDescription, true);
    assert.equal(result.features.hasSvgDescription, true);
  });

  it('strips markdown fences from LLM output', function () {
    const fenced = '```yaml\n' + SAMPLE_LESSON.trim() + '\n```';
    const result = validateYaml(fenced, null);
    assert.equal(result.valid, true, 'Fenced YAML should validate: ' + JSON.stringify(result.errors));
  });

  it('extracts _gap_analysis before validation', function () {
    const result = validateYaml(SAMPLE_WITH_GAP, null);
    assert.ok(result.gapAnalysis, 'Should have gap analysis');
    assert.equal(result.gapAnalysis.wished_factories.length, 1);
    assert.equal(result.gapAnalysis.wished_factories[0].id, 'histogram');
    assert.equal(result.gapAnalysis.wished_step_types.length, 1);
    assert.equal(result.gapAnalysis.wished_step_types[0].id, 'drawing');
    assert.equal(result.gapAnalysis.pedagogical_limitations.length, 1);
    assert.equal(result.gapAnalysis.accessibility_gaps.length, 1);
    // The lesson itself should still be valid after stripping _gap_analysis
    assert.equal(result.valid, true, 'Should be valid after stripping gaps: ' + JSON.stringify(result.errors));
  });

  it('rejects malformed YAML', function () {
    const result = validateYaml('{{not yaml at all}}', null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('rejects missing steps', function () {
    const result = validateYaml('version: "1.8.0"\nmeta:\n  identifier: "x"\n', null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(function (e) { return e.includes('steps'); }));
  });

  it('detects duplicate step ids', function () {
    const yaml = `
version: "1.8.0"
meta:
  identifier: "ols:test:dup_v1"
  title: "Dup Test"
  language: "en"
  license: "CC-BY-SA-4.0"
  created: "2026-03-01T00:00:00Z"
steps:
  - id: step-1
    type: instruction
    content: "A"
  - id: step-1
    type: completion
    content: "B"
`;
    const result = validateYaml(yaml, null);
    assert.ok(result.errors.some(function (e) { return e.includes('Duplicate'); }));
  });

  it('detects invalid step id format', function () {
    const yaml = `
version: "1.8.0"
meta:
  identifier: "ols:test:bad_v1"
  title: "Bad ID"
  language: "en"
  license: "CC-BY-SA-4.0"
  created: "2026-03-01T00:00:00Z"
steps:
  - id: "Step One!"
    type: instruction
    content: "A"
  - id: done
    type: completion
    content: "B"
`;
    const result = validateYaml(yaml, null);
    assert.ok(result.errors.some(function (e) { return e.includes('Invalid step id'); }));
  });
});

describe('prompt-builder', function () {
  it('builds a prompt for a lesson spec', function () {
    const spec = {
      lessonId: 'test--K--counting-to-20--sensory-intake',
      subject: 'math',
      subjectLabel: 'Mathematics',
      spinePrefix: 'MAC',
      grade: 'K',
      ageRange: '5-6',
      band: 1,
      unit: 'counting-to-20',
      unitTitle: 'Counting to 20',
      topics: ['count forward', 'count backward'],
      archetype: 'sensory-intake',
      archetypeLabel: 'Sensory Intake',
      stepPattern: ['instruction', 'instruction', 'quiz', 'completion'],
      blooms: ['remember', 'understand'],
      protocols: ['P1'],
      thetaModifier: 0.9,
      teachingMode: 'didactic',
      branchingModel: 'linear',
      svgFactories: ['numberLine'],
      sensors: []
    };

    const prompt = buildPrompt(spec);

    assert.ok(prompt.system.length > 1000, 'System prompt should be substantial');
    assert.ok(prompt.user.length > 500, 'User prompt should be substantial');
    assert.ok(prompt.user.includes('Counting to 20'));
    assert.ok(prompt.user.includes('sensory-intake'));
    assert.ok(prompt.user.includes('numberLine'));
    assert.ok(prompt.user.includes('_gap_analysis'));
    assert.ok(prompt.system.includes('wished_factories'));
    assert.ok(prompt.system.includes('wished_step_types'));
  });
});
