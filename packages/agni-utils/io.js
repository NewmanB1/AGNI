const fs = require('fs');

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dir - Directory path to ensure
 */
function ensureDir(dir) {
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read a file, returning null if it doesn't exist.
 * @param {string} filePath - Path to read
 * @returns {string|null}
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write content to destPath only if sourceMtimeMs is more recent.
 * @param {number} sourceMtimeMs - mtime of the authoritative source
 * @param {string} destPath - output path
 * @param {string} content - content to write
 * @returns {boolean} true if written, false if skipped
 */
function writeIfNewer(sourceMtimeMs, destPath, content) {
  if (fs.existsSync(destPath)) {
    if (sourceMtimeMs <= fs.statSync(destPath).mtimeMs) return false;
  }
  fs.writeFileSync(destPath, content, 'utf8');
  return true;
}

/**
 * Copy sourcePath to destPath only if source is newer than dest.
 * @param {string} sourcePath
 * @param {string} destPath
 * @returns {boolean} true if copied, false if skipped
 */
function copyIfNewer(sourcePath, destPath) {
  const sourceMtime = fs.statSync(sourcePath).mtimeMs;
  if (fs.existsSync(destPath) && sourceMtime <= fs.statSync(destPath).mtimeMs) return false;
  fs.writeFileSync(destPath, fs.readFileSync(sourcePath, 'utf8'));
  return true;
}

/**
 * Escape HTML special characters for safe embedding in HTML attributes/text.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

module.exports = { ensureDir, readFileSafe, writeIfNewer, copyIfNewer, escapeHtml };
