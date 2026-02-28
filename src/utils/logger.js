'use strict';

/**
 * Structured logger for AGNI hub services.
 * Outputs JSON lines to stdout and optionally appends to a log file.
 */

const fs = require('fs');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.AGNI_LOG_LEVEL || 'info'] || LEVELS.info;

/**
 * Create a logger instance with a fixed component tag.
 * @param {string} component  e.g. 'theta', 'sentry', 'sync'
 * @param {{ logFile?: string }} [opts]
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 */
function createLogger(component, opts) {
  const logFile = opts && opts.logFile;

  function emit(level, msg, extra) {
    if (LEVELS[level] < MIN_LEVEL) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg
    };
    if (extra) Object.assign(entry, extra);
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    if (logFile) {
      fs.appendFile(logFile, line + '\n', () => {});
    }
  }

  return {
    debug: (msg, extra) => emit('debug', msg, extra),
    info:  (msg, extra) => emit('info', msg, extra),
    warn:  (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra)
  };
}

module.exports = { createLogger };
