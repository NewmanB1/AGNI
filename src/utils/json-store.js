'use strict';

/**
 * Shared JSON file persistence with basic write safety.
 * Provides loadJSON / saveJSON used across hub-tools and services.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { createLogger } = require('./logger');
const log = createLogger('json-store');

/**
 * Load a JSON file, returning `fallback` on missing file or parse error.
 * @param {string} filePath
 * @param {*} [fallback={}]
 * @returns {*}
 */
function loadJSON(filePath, fallback) {
  if (fallback === undefined) fallback = {};
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    log.error('Failed to parse file', { filePath, error: e.message });
    try {
      const backupPath = filePath + '.corrupt.' + Date.now();
      fs.copyFileSync(filePath, backupPath);
      log.error('Corrupted file backed up', { backupPath });
    } catch { /* backup is best-effort */ }
    return fallback;
  }
}

/**
 * Atomically write a JSON file (write to .tmp then rename).
 * Creates parent directories as needed.
 * @param {string} filePath
 * @param {*} data
 * @param {{ minified?: boolean }} [opts]
 */
function saveJSON(filePath, data, opts) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const json = (opts && opts.minified)
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Get file modification time in ms, or 0 if file doesn't exist.
 * @param {string} filePath
 * @returns {number}
 */
function getFileMtime(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.statSync(filePath).mtimeMs;
  } catch { /* ignore */ }
  return 0;
}

/**
 * Async version of loadJSON. Uses fs.promises to avoid blocking the event loop.
 * @param {string} filePath
 * @param {*} [fallback={}]
 * @returns {Promise<*>}
 */
async function loadJSONAsync(filePath, fallback) {
  if (fallback === undefined) fallback = {};
  try {
    await fsp.access(filePath);
  } catch {
    return fallback;
  }
  try {
    const data = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    log.error('Failed to parse file', { filePath, error: e.message });
    try {
      const backupPath = filePath + '.corrupt.' + Date.now();
      await fsp.copyFile(filePath, backupPath);
      log.error('Corrupted file backed up', { backupPath });
    } catch { /* backup is best-effort */ }
    return fallback;
  }
}

/**
 * Async version of saveJSON. Atomic write via .tmp + rename.
 * @param {string} filePath
 * @param {*} data
 * @param {{ minified?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function saveJSONAsync(filePath, data, opts) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const json = (opts && opts.minified)
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now();
  await fsp.writeFile(tmpPath, json, 'utf8');
  await fsp.rename(tmpPath, filePath);
}

/**
 * Async version of getFileMtime.
 * @param {string} filePath
 * @returns {Promise<number>}
 */
async function getFileMtimeAsync(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

module.exports = { loadJSON, saveJSON, getFileMtime, loadJSONAsync, saveJSONAsync, getFileMtimeAsync };
