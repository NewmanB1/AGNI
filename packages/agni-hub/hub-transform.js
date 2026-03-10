// packages/agni-hub/hub-transform.js
// AGNI Hub Transform  v1.0.0
//
// On-demand lesson delivery server. Transforms YAML source into compiled
// lesson HTML at request time and serves it directly to the device browser.
// Also serves factory files, KaTeX CSS, and static runtime assets.
//
// Module layout:
//   hub-transform/compile.js      — YAML load, IR compilation, in-flight guard
//   hub-transform/cache.js        — disk + memory cache, compile slot management
//   hub-transform/assemble.js     — HTML assembly, PWA shell, device binding
//   hub-transform/serve-assets.js — response helpers, factory/KaTeX whitelists
//   hub-transform/route-handlers.js — HTTP route matching and handling
//
// Exports: attachRoutes, startStandalone, handleRequest, compileLesson, loadYaml

'use strict';
/// <reference types="node" />

var path = require('path');
var http = require('http');
var { loadHubConfig } = require('@agni/utils/hub-config');
var createLogger = require('@agni/utils/logger').createLogger;

loadHubConfig(path.join(__dirname, '../../data'));

var log = createLogger('hub-transform');
var routeHandlers = require('./hub-transform/route-handlers');
var compile = require('./hub-transform/compile');
var envConfig = require('@agni/utils/env-config');

var SERVE_PORT = envConfig.servePort;

function handleRequest(req, res, options) {
  return routeHandlers.handleRequest(req, res, options);
}

function attachRoutes(server, options) {
  var listeners = server.listeners('request').slice();
  server.removeAllListeners('request');

  server.on('request', function (req, res) {
    var handled = handleRequest(req, res, options || {});
    if (!handled) {
      for (var i = 0; i < listeners.length; i++) {
        listeners[i].call(server, req, res);
      }
    }
  });

  log.info('Routes attached — serving /lessons/, /factories/, /katex/');
}

function startStandalone(options) {
  var server = http.createServer(function (req, res) {
    var handled = handleRequest(req, res, options || {});
    if (!handled) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  server.listen(SERVE_PORT, '0.0.0.0', function () {
    log.info('Standalone server listening', { port: SERVE_PORT });
  });
  return server;
}

module.exports = {
  attachRoutes:    attachRoutes,
  startStandalone: startStandalone,
  handleRequest:   handleRequest,
  compileLesson:   compile.compileLesson,
  loadYaml:        compile.loadYaml
};
