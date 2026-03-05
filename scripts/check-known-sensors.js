#!/usr/bin/env node
'use strict';

/**
 * CI gate: verify every sensor ID published by the sensor-bridge is registered
 * in @agni/plugins. Prevents authors from using sensors in thresholds that
 * the runtime cannot provide.
 *
 * Exit 0 on pass, exit 1 on any failure.
 */

var plugins = require('@agni/plugins');
var knownIds = plugins.getKnownSensorIds();

var BRIDGE_SENSOR_IDS = [
  'accel.x', 'accel.y', 'accel.z', 'accel.magnitude',
  'accel.total.x', 'accel.total.y', 'accel.total.z', 'accel.total',
  'gyro.x', 'gyro.y', 'gyro.z', 'gyro.magnitude',
  'rotation.alpha', 'rotation.beta', 'rotation.gamma',
  'orientation', 'shake',
  'mag.x', 'mag.y', 'mag.z', 'mag.magnitude', 'mag.total',
  'light', 'pressure', 'temperature', 'sound.level'
];

var missing = [];
for (var i = 0; i < BRIDGE_SENSOR_IDS.length; i++) {
  var id = BRIDGE_SENSOR_IDS[i];
  if (!knownIds.has(id)) {
    missing.push(id);
  }
}

if (missing.length > 0) {
  console.error('FAIL  Sensor IDs published by sensor-bridge but not in @agni/plugins: ' + missing.join(', '));
  console.error('      Add them to packages/agni-plugins/builtins/sensors.js');
  process.exit(1);
}

console.log('OK    All ' + BRIDGE_SENSOR_IDS.length + ' sensor-bridge IDs are registered in @agni/plugins');
process.exit(0);
