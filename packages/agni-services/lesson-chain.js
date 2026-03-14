'use strict';

/**
 * Lesson hash-chain service — content-addressed immutability for AGNI lessons.
 *
 * Config injection: createLessonChain({ dataDir }) returns an instance using
 * that directory for loadChain, appendVersion, getLatestVersion, verifyChain.
 * Pure functions (canonicalize, computeContentHash, etc.) are stateless.
 * Default (no opts) uses envConfig.dataDir.
 */

const path = require('path');
const crypto = require('crypto');

const fs = require('fs');
const envConfig = require('@agni/utils/env-config');
const { loadJSONAsync, saveJSONAsync } = require('@agni/utils/json-store');

function canonicalize(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj)
    .filter((k) => !k.startsWith('_') && k !== 'content_hash' && k !== 'parent_hash' && k !== 'uri' && k !== 'chain')
    .sort();
  return '{' + keys.map(function(k) { return JSON.stringify(k) + ':' + canonicalize(obj[k]); }).join(',') + '}';
}

function stripChainFields(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const copy = {};
  for (const k of Object.keys(meta)) {
    if (k === 'content_hash' || k === 'parent_hash' || k === 'uri' || k === 'chain' || k.startsWith('_')) continue;
    copy[k] = meta[k];
  }
  return copy;
}

function computeContentHash(lessonData) {
  const m = lessonData.meta || lessonData;
  const hashInput = {
    meta: stripChainFields(m),
    steps: lessonData.steps || [],
    version: lessonData.version || '1.7.0'
  };
  if (lessonData.gate) hashInput.gate = lessonData.gate;
  if (lessonData.ontology) hashInput.ontology = lessonData.ontology;
  if (lessonData.fork) hashInput.fork = lessonData.fork;
  const canonical = canonicalize(hashInput);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'sha256:' + hash;
}

function shortHash(fullHash) {
  if (!fullHash) return '';
  return fullHash.replace(/^sha256:/, '').slice(0, 12);
}

function buildUri(creatorId, slug) {
  if (!creatorId || !slug) return '';
  return 'agni:' + creatorId + '/' + slug;
}

function buildVersionUri(creatorId, slug, contentHash) {
  const base = buildUri(creatorId, slug);
  if (!base || !contentHash) return base;
  return base + '@' + shortHash(contentHash);
}

function parseUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const match = uri.match(/^agni:([^/]+)\/([^@]+)(?:@([a-f0-9]+))?$/);
  if (!match) return null;
  return { creatorId: match[1], slug: match[2], versionHash: match[3] || undefined };
}

function createLessonChain(config) {
  const dataDir = (config && config.dataDir) || envConfig.dataDir;
  const chainsDir = path.join(dataDir, 'chains');

  function chainPath(slug) {
    return path.join(chainsDir, slug + '.chain.json');
  }

  function loadChain(slug) {
    return loadJSONAsync(chainPath(slug), { slug: slug, versions: [] });
  }

  function saveChain(slug, chain) {
    return saveJSONAsync(chainPath(slug), chain);
  }

  async function appendVersion(slug, entry) {
  const chain = await loadChain(slug);
  const version = chain.versions.length + 1;
  chain.versions.push({
    version: version,
    contentHash: entry.contentHash,
    parentHash: entry.parentHash || null,
    creatorId: entry.creatorId || null,
    uri: entry.uri || null,
    timestamp: entry.timestamp || new Date().toISOString()
  });
  const maxVersions = (envConfig.yamlMaxVersions != null && envConfig.yamlMaxVersions >= 1)
    ? envConfig.yamlMaxVersions
    : 0;
  if (maxVersions > 0 && chain.versions.length > maxVersions) {
    const excess = chain.versions.length - maxVersions;
    chain.versions.splice(0, excess);
    const first = chain.versions[0];
    if (first) first.parentHash = null;
    for (let i = 0; i < chain.versions.length; i++) {
      chain.versions[i].version = i + 1;
    }
    await saveChain(slug, chain);
  } else {
    await saveChain(slug, chain);
  }
  return { ok: true, version: version };
}

async function getLatestVersion(slug) {
  const chain = await loadChain(slug);
  if (!chain.versions.length) return null;
  return chain.versions[chain.versions.length - 1];
}

async function verifyChain(slug) {
  const chain = await loadChain(slug);
  const errors = [];
  for (let i = 0; i < chain.versions.length; i++) {
    const v = chain.versions[i];
    if (i === 0) {
      if (v.parentHash !== null) errors.push('Version 1 should have null parentHash, got ' + v.parentHash);
    } else {
      const prev = chain.versions[i - 1];
      if (v.parentHash !== prev.contentHash) {
        errors.push('Version ' + v.version + ' parentHash mismatch');
      }
    }
  }
  return { valid: errors.length === 0, errors: errors, versions: chain.versions.length };
  }

  async function pruneOldVersions(slug, maxVersions) {
    if (!maxVersions || maxVersions < 1) return { pruned: 0 };
    const chain = await loadChain(slug);
    if (chain.versions.length <= maxVersions) return { pruned: 0 };
    const excess = chain.versions.length - maxVersions;
    chain.versions.splice(0, excess);
    const first = chain.versions[0];
    if (first) first.parentHash = null;
    for (let i = 0; i < chain.versions.length; i++) {
      chain.versions[i].version = i + 1;
    }
    await saveChain(slug, chain);
    return { pruned: excess };
  }

  return { loadChain, appendVersion, getLatestVersion, verifyChain, pruneOldVersions };
}

function verifyContentHash(lessonData) {
  const m = lessonData.meta || lessonData;
  const claimed = m.content_hash || '';
  const computed = computeContentHash(lessonData);
  return { valid: computed === claimed, computed: computed, claimed: claimed };
}

const FORKABLE_LICENSES = new Set(['CC-BY-SA-4.0', 'CC-BY-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-4.0', 'CC0-1.0', 'MIT']);
const NON_COMMERCIAL_LICENSES = new Set(['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0']);

function checkForkPermission(license) {
  if (!license) return { allowed: false, reason: 'Source lesson has no license specified' };
  if (license === 'All-Rights-Reserved') return { allowed: false, reason: 'Source lesson is All Rights Reserved — forking is not permitted' };
  if (FORKABLE_LICENSES.has(license)) {
    const nc = NON_COMMERCIAL_LICENSES.has(license);
    return { allowed: true, nonCommercial: nc, reason: nc ? 'Non-commercial license' : undefined };
  }
  return { allowed: false, reason: 'Unknown license "' + license + '" — cannot determine fork permission' };
}

function inheritedForkLicense(sourceLicense) {
  const saLicenses = { 'CC-BY-SA-4.0': true, 'CC-BY-NC-SA-4.0': true };
  return saLicenses[sourceLicense] ? sourceLicense : null;
}

const defaultChain = createLessonChain();

/**
 * P2-20: Prune all lesson chains to yamlMaxVersions. Call at hub startup.
 * @returns {Promise<{ pruned: number, slugs: string[] }>}
 */
async function pruneAllChainVersions() {
  const dataDir = envConfig.dataDir;
  const chainsDir = path.join(dataDir, 'chains');
  const maxVersions = (envConfig.yamlMaxVersions != null && envConfig.yamlMaxVersions >= 1)
    ? envConfig.yamlMaxVersions
    : 0;
  if (!maxVersions) return { pruned: 0, slugs: [] };
  if (!fs.existsSync(chainsDir)) return { pruned: 0, slugs: [] };
  const files = fs.readdirSync(chainsDir).filter((f) => f.endsWith('.chain.json'));
  const chain = createLessonChain();
  let totalPruned = 0;
  const prunedSlugs = [];
  for (let i = 0; i < files.length; i++) {
    const slug = files[i].replace(/\.chain\.json$/, '');
    const r = await chain.pruneOldVersions(slug, maxVersions);
    if (r.pruned > 0) {
      totalPruned += r.pruned;
      prunedSlugs.push(slug);
    }
  }
  return { pruned: totalPruned, slugs: prunedSlugs };
}

module.exports = {
  computeContentHash,
  shortHash,
  buildUri,
  buildVersionUri,
  parseUri,
  canonicalize,
  loadChain: defaultChain.loadChain,
  appendVersion: defaultChain.appendVersion,
  getLatestVersion: defaultChain.getLatestVersion,
  verifyChain: defaultChain.verifyChain,
  verifyContentHash,
  checkForkPermission,
  inheritedForkLicense,
  FORKABLE_LICENSES,
  NON_COMMERCIAL_LICENSES,
  createLessonChain,
  pruneAllChainVersions
};
