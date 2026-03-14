// packages/agni-hub/lesson-server.js
// AGNI Lesson Server v1.0.0
//
// On-demand lesson delivery server. Transforms YAML source into compiled
// lesson HTML at request time and serves it directly to the device browser.
// Also serves factory files, KaTeX CSS, and static runtime assets.
//
// Module layout:
//   lesson-server/compile.js      — YAML load, IR compilation, in-flight guard
//   lesson-server/cache.js        — disk + memory cache, compile slot management
//   lesson-server/assemble.js     — HTML assembly, PWA shell, device binding
//   lesson-server/serve-assets.js — response helpers, factory/KaTeX whitelists
//   lesson-server/route-handlers.js — HTTP route matching and handling
//
// Exports: attachRoutes, startStandalone, handleRequest, compileLesson, loadYaml

'use strict';
/// <reference types="node" />

const path = require('path');
const http = require('http');
const { loadHubConfig } = require('@agni/utils/hub-config');
const createLogger = require('@agni/utils/logger').createLogger;

loadHubConfig(path.join(__dirname, '../../data'));

const log = createLogger('lesson-server');
const routeHandlers = require('./lesson-server/route-handlers');
const compile = require('./lesson-server/compile');
const envConfig = require('@agni/utils/env-config');

const SERVE_PORT = envConfig.servePort;

function handleRequest(req, res, options) {
  return routeHandlers.handleRequest(req, res, options);
}

function attachRoutes(server, options) {
  const listeners = server.listeners('request').slice();
  server.removeAllListeners('request');

  server.on('request', function (req, res) {
    const handled = handleRequest(req, res, options || {});
    if (!handled) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].call(server, req, res);
      }
    }
  });

  log.info('Routes attached — serving /lessons/, /factories/, /katex/');
}

function startStandalone(options) {
  const server = http.createServer(function (req, res) {
    const handled = handleRequest(req, res, options || {});
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
