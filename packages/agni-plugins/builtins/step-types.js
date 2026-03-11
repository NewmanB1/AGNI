'use strict';

// Built-in step type descriptors.
// To add a new step type, add ONE entry here and write the renderer.

const reg = require('../registry');

const COMMON_FIELDS = [
  'id', 'type', 'content', 'feedback', 'expected_duration', 'max_attempts',
  'weight', 'on_fail', 'on_success', 'audio_description', 'condition', 'next_if', 'svg_spec', 'spec'
];

reg.registerStepType({
  type: 'instruction',
  label: 'Instruction',
  description: 'Text/content step with optional SVG visual.',
  fields: COMMON_FIELDS
});

reg.registerStepType({
  type: 'hardware_trigger',
  label: 'Hardware Trigger',
  description: 'Waits for a sensor threshold to be met before proceeding.',
  fields: COMMON_FIELDS.concat(['sensor', 'threshold']),
  requiredFields: ['threshold']
});

reg.registerStepType({
  type: 'quiz',
  label: 'Multiple Choice Quiz',
  description: 'MCQ with selectable answer options.',
  fields: COMMON_FIELDS.concat(['answer_options', 'correct_index']),
  requiredFields: ['answer_options', 'correct_index']
});

reg.registerStepType({
  type: 'fill_blank',
  label: 'Fill in the Blank',
  description: 'Cloze exercise with ___ placeholders.',
  fields: COMMON_FIELDS.concat(['blanks']),
  requiredFields: ['blanks']
});

reg.registerStepType({
  type: 'matching',
  label: 'Matching',
  description: 'Pair left items with right items.',
  fields: COMMON_FIELDS.concat(['pairs']),
  requiredFields: ['pairs']
});

reg.registerStepType({
  type: 'ordering',
  label: 'Ordering',
  description: 'Arrange items in the correct sequence.',
  fields: COMMON_FIELDS.concat(['items', 'correct_order']),
  requiredFields: ['items', 'correct_order']
});

reg.registerStepType({
  type: 'completion',
  label: 'Completion',
  description: 'Lesson-complete screen with optional badge.',
  fields: COMMON_FIELDS
});
