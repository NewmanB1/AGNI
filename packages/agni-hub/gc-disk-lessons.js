'use strict';

/**
 * P2-20: Disk GC for serveDir/lessons.
 * Prunes orphan compiled lesson dirs (no catalog, no YAML source) to prevent Pi disk exhaustion.
 * Policy: keep compiled output only for slugs in catalog or with YAML in yamlDir.
 */

const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

const envConfig = require('@agni/utils/env-config');
const createLogger = require('@agni/utils/logger').createLogger;

const log = createLogger('gc-disk-lessons');

/**
 * Prune a single lesson's compiled dir. Call after YAML delete.
 * @param {string} slug
 * @param {string} [serveDir]
 * @returns {Promise<{ pruned: boolean, path?: string }>}
 */
async function pruneLessonCompiledDir(slug, serveDir) {
  const root = serveDir || envConfig.serveDir;
  const lessonDir = path.join(root, 'lessons', slug);
  try {
    const stat = await fsp.stat(lessonDir);
    if (!stat.isDirectory()) return { pruned: false };
  } catch (e) {
    if (e.code === 'ENOENT') return { pruned: false };
    throw e;
  }
  try {
    await fsp.rm(lessonDir, { recursive: true });
    log.info('P2-20: pruned orphan lesson dir (delete)', { slug: slug, path: lessonDir });
    return { pruned: true, path: lessonDir };
  } catch (e) {
    log.warn('P2-20: failed to prune lesson dir', { slug: slug, path: lessonDir, error: e.message });
    return { pruned: false };
  }
}

/**
 * Prune all orphan lesson dirs. Valid slugs = catalog + yamlDir.
 * @param {object} opts
 * @param {string} [opts.serveDir]
 * @param {Set<string>} [opts.validSlugs] - slugs to keep (catalog ∪ yaml)
 * @param {string} [opts.yamlDir] - scan for .yaml if validSlugs not provided
 * @param {string[]} [opts.catalogSlugs] - from catalog.lessons
 * @returns {Promise<{ pruned: string[] }>}
 */
async function pruneOrphanLessons(opts) {
  const serveDir = opts.serveDir || envConfig.serveDir;
  const lessonsRoot = path.join(serveDir, 'lessons');

  let validSlugs = opts.validSlugs;
  if (!validSlugs) {
    validSlugs = new Set();
    if (Array.isArray(opts.catalogSlugs)) {
      for (let i = 0; i < opts.catalogSlugs.length; i++) {
        if (opts.catalogSlugs[i]) validSlugs.add(opts.catalogSlugs[i]);
      }
    }
    const yamlDir = opts.yamlDir || envConfig.yamlDir;
    try {
      const files = await fsp.readdir(yamlDir);
      for (let i = 0; i < files.length; i++) {
        if (files[i].endsWith('.yaml')) {
          validSlugs.add(files[i].replace(/\.yaml$/, ''));
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') log.warn('gc: cannot read yamlDir', { yamlDir: yamlDir, error: e.message });
    }
  }

  const pruned = [];
  try {
    const dirs = await fsp.readdir(lessonsRoot);
    for (let d = 0; d < dirs.length; d++) {
      const slug = dirs[d];
      if (validSlugs.has(slug)) continue;
      const lessonDir = path.join(lessonsRoot, slug);
      let isDir = false;
      try {
        const stat = await fsp.stat(lessonDir);
        isDir = stat.isDirectory();
      } catch (e) { void e; }
      if (!isDir) continue;
      try {
        await fsp.rm(lessonDir, { recursive: true });
        pruned.push(slug);
        log.info('P2-20: pruned orphan lesson dir', { slug: slug });
      } catch (e) {
        log.warn('P2-20: failed to prune', { slug: slug, error: e.message });
      }
    }
  } catch (e) {
    if (e.code === 'ENOENT') return { pruned: [] };
    throw e;
  }
  if (pruned.length > 0) {
    log.info('P2-20: disk GC complete', { pruned: pruned.length, slugs: pruned.slice(0, 10) });
  }
  return { pruned: pruned };
}

module.exports = {
  pruneLessonCompiledDir,
  pruneOrphanLessons
};
