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

module.exports = { ensureDir, readFileSafe };
