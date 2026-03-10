'use strict';

/**
 * Atomic write with fsync for Pi/SD card durability.
 * Writes to .tmp, fsyncs to force physical flush, then renames.
 * Prevents corruption when power is lost during write.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/**
 * Write data to filePath atomically with fsync before rename.
 * @param {string} filePath
 * @param {string} data
 */
function atomicWriteSync(filePath, data) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  var tmpPath = filePath + '.tmp';
  var fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
  try {
    var parentFd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(parentFd); } finally { fs.closeSync(parentFd); }
  } catch (e) { /* non-fatal */ }
}

/**
 * Async atomic write with fsync.
 * @param {string} filePath
 * @param {string} data
 * @returns {Promise<void>}
 */
async function atomicWrite(filePath, data) {
  var dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  var tmpPath = filePath + '.tmp';
  var fd = await fsp.open(tmpPath, 'w');
  try {
    await fd.writeFile(data, 'utf8');
    await fd.sync();
  } finally {
    await fd.close();
  }
  await fsp.rename(tmpPath, filePath);
  try {
    var parentFd = await fsp.open(dir, 'r');
    try { await parentFd.sync(); } finally { await parentFd.close(); }
  } catch (e) { /* non-fatal */ }
}

module.exports = { atomicWriteSync, atomicWrite };
