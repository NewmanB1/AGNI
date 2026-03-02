'use strict';

// Internal registry store — shared between index.js and builtins.

var _factories = [];
var _stepTypes = [];
var _sensors   = [];

function registerFactory(descriptor) {
  if (!descriptor || !descriptor.id) throw new Error('[plugins] factory descriptor must have an id');
  if (_factories.some(function (f) { return f.id === descriptor.id; })) return;
  _factories.push(descriptor);
}

function registerStepType(descriptor) {
  if (!descriptor || !descriptor.type) throw new Error('[plugins] step type descriptor must have a type');
  if (_stepTypes.some(function (s) { return s.type === descriptor.type; })) return;
  _stepTypes.push(descriptor);
}

function registerSensor(descriptor) {
  if (!descriptor || !descriptor.id) throw new Error('[plugins] sensor descriptor must have an id');
  if (_sensors.some(function (s) { return s.id === descriptor.id; })) return;
  _sensors.push(descriptor);
}

module.exports = {
  _factories:      _factories,
  _stepTypes:      _stepTypes,
  _sensors:        _sensors,
  registerFactory: registerFactory,
  registerStepType: registerStepType,
  registerSensor:  registerSensor
};
