'use strict';
// Backward-compatibility shim: hub-transform lives in packages/agni-hub
const hub = require('@agni/hub');
module.exports = hub.lessonServer || hub.hubTransform || hub;
