'use strict';
// Backward-compatibility shim: hub-transform lives in packages/agni-hub
var hub = require('@agni/hub');
module.exports = hub.hubTransform || hub;
