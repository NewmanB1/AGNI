'use strict';

/**
 * Package smoke tests — verifies each monorepo package loads without error.
 * Catches wiring breakage, missing dependencies, and require-path mistakes early.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Package smoke tests', function () {
  it('@agni/utils loads and exports expected shape', function () {
    const utils = require('@agni/utils');
    assert.ok(utils, '@agni/utils exported null/undefined');
    assert.ok(utils.logger && typeof utils.logger.createLogger === 'function', 'logger.createLogger missing');
  });

  it('@ols/schema loads and exports validators', function () {
    const schema = require('@ols/schema');
    assert.ok(schema, '@ols/schema exported null/undefined');
    assert.ok(schema.lessonValidator || schema.lessonSchema, 'lessonValidator or lessonSchema missing');
  });

  it('@agni/engine loads and exports core functions', function () {
    const engine = require('@agni/engine');
    assert.ok(engine, '@agni/engine exported null/undefined');
    assert.ok(engine.rasch || engine.selectLesson || engine.recordObservation,
      'engine should export rasch, selectLesson, or recordObservation');
  });

  it('@agni/runtime loads (Node barrel)', function () {
    const runtime = require('@agni/runtime');
    assert.ok(runtime, '@agni/runtime exported null/undefined');
    assert.ok(runtime.RUNTIME_ROOT, 'RUNTIME_ROOT missing');
    assert.ok(typeof runtime.resolve === 'function', 'resolve function missing');
  });

  it('@agni/governance loads and exports functions', function () {
    const gov = require('@agni/governance');
    assert.ok(gov, '@agni/governance exported null/undefined');
    assert.ok(typeof gov === 'object', '@agni/governance should be an object');
  });

  it('@ols/compiler loads and exports buildLessonIR or builders', function () {
    const compiler = require('@ols/compiler');
    assert.ok(compiler, '@ols/compiler exported null/undefined');
    const hasBuild = typeof compiler.buildLessonIR === 'function' ||
      (compiler.builders && compiler.builders.html);
    assert.ok(hasBuild, '@ols/compiler should export buildLessonIR or builders.html');
  });

  it('@agni/hub loads and exports theta, hubTransform', function () {
    const hub = require('@agni/hub');
    assert.ok(hub, '@agni/hub exported null/undefined');
    assert.ok(hub.theta, 'hub.theta missing');
    assert.ok(hub.hubTransform, 'hub.hubTransform missing');
  });
});
