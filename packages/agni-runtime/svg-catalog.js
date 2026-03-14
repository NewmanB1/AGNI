'use strict';
/**
 * Export FACTORIES and CATEGORIES from the runtime SVG registry.
 * Portal and other Node consumers import from @agni/runtime/svg-catalog.
 * Single source of truth: svg-registry.js.
 */
/** @type {{ AGNI_SVG?: object, window?: object }} */
var g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {});
if (!g.AGNI_SVG) g.AGNI_SVG = {};
if (!g.window) g.window = g;
module.exports = require('./rendering/svg-registry.js');
