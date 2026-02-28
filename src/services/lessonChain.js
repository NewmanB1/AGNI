'use strict';

/**
 * Lesson hash-chain service — content-addressed immutability for AGNI lessons.
 *
 * Each lesson version is hashed (SHA-256 over canonical JSON of meta + steps).
 * Successive versions form a chain: each points to its parent hash.
 * The chain is stored per-slug in data/chains/<slug>.chain.json.
 *
 * URI scheme:  agni:<creator_id>/<slug>
 * Version ref: agni:<creator_id>/<slug>@<short_hash>
 *
 * Fork permissions are determined by the source lesson's license.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.AGNI_DATA_DIR || path.join(__dirname, '../../data');
const CHAINS_DIR = path.join(DATA_DIR, 'chains');

// ── Canonical hashing ────────────────────────────────────────────────────────

/**
 * Produce a deterministic JSON string for hashing.
 * Strips internal/transient fields (prefixed with _), then sorts keys recursively.
 */
function canonicalize(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj)
    .filter(k => !k.startsWith('_') && k !== 'content_hash' && k !== 'parent_hash' && k !== 'uri' && k !== 'chain')
    .sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/**
 * Compute SHA-256 content hash of a lesson.
 * Hashes the canonical form of { meta, steps, version, fork, gate, ontology }.
 * Returns "sha256:<64 hex chars>".
 */
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

function stripChainFields(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const copy = {};
  for (const k of Object.keys(meta)) {
    if (k === 'content_hash' || k === 'parent_hash' || k === 'uri' || k === 'chain' || k.startsWith('_')) continue;
    copy[k] = meta[k];
  }
  return copy;
}

/** Extract the short hash (first 12 hex chars) from a full "sha256:..." string. */
function shortHash(fullHash) {
  if (!fullHash) return '';
  const hex = fullHash.replace(/^sha256:/, '');
  return hex.slice(0, 12);
}

// ── URI generation ───────────────────────────────────────────────────────────

/**
 * Build the canonical lesson URI.
 * Format: agni:<creator_id>/<slug>
 * @param {string} creatorId  e.g. "cr-4f0304246244"
 * @param {string} slug       e.g. "intro-to-fractions"
 * @returns {string}
 */
function buildUri(creatorId, slug) {
  if (!creatorId || !slug) return '';
  return 'agni:' + creatorId + '/' + slug;
}

/**
 * Build a version-specific URI.
 * Format: agni:<creator_id>/<slug>@<short_hash>
 */
function buildVersionUri(creatorId, slug, contentHash) {
  const base = buildUri(creatorId, slug);
  if (!base || !contentHash) return base;
  return base + '@' + shortHash(contentHash);
}

/**
 * Parse a lesson URI into its components.
 * @param {string} uri  e.g. "agni:cr-abc123/my-lesson@a3b7c9d2e1f4"
 * @returns {{ creatorId: string, slug: string, versionHash?: string } | null}
 */
function parseUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const match = uri.match(/^agni:([^/]+)\/([^@]+)(?:@([a-f0-9]+))?$/);
  if (!match) return null;
  return {
    creatorId: match[1],
    slug: match[2],
    versionHash: match[3] || undefined
  };
}

// ── Chain management ─────────────────────────────────────────────────────────

function chainPath(slug) {
  return path.join(CHAINS_DIR, slug + '.chain.json');
}

function loadChain(slug) {
  const fp = chainPath(slug);
  if (!fs.existsSync(fp)) return { slug, versions: [] };
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return { slug, versions: [] }; }
}

function saveChain(slug, chain) {
  fs.mkdirSync(CHAINS_DIR, { recursive: true });
  fs.writeFileSync(chainPath(slug), JSON.stringify(chain, null, 2), 'utf8');
}

/**
 * Record a new version in the lesson chain.
 * @param {string} slug
 * @param {{ contentHash: string, parentHash: string|null, creatorId: string, uri: string, timestamp: string }} entry
 * @returns {{ ok: boolean, version: number }}
 */
function appendVersion(slug, entry) {
  const chain = loadChain(slug);
  const version = chain.versions.length + 1;
  chain.versions.push({
    version,
    contentHash: entry.contentHash,
    parentHash: entry.parentHash || null,
    creatorId: entry.creatorId || null,
    uri: entry.uri || null,
    timestamp: entry.timestamp || new Date().toISOString()
  });
  saveChain(slug, chain);
  return { ok: true, version };
}

/**
 * Get the latest version entry for a slug (or null if no chain exists).
 */
function getLatestVersion(slug) {
  const chain = loadChain(slug);
  if (!chain.versions.length) return null;
  return chain.versions[chain.versions.length - 1];
}

/**
 * Verify the integrity of a lesson's chain.
 * Checks that each version's parentHash matches the previous version's contentHash.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function verifyChain(slug) {
  const chain = loadChain(slug);
  const errors = [];
  for (let i = 0; i < chain.versions.length; i++) {
    const v = chain.versions[i];
    if (i === 0) {
      if (v.parentHash !== null) {
        errors.push('Version 1 should have null parentHash, got ' + v.parentHash);
      }
    } else {
      const prev = chain.versions[i - 1];
      if (v.parentHash !== prev.contentHash) {
        errors.push('Version ' + v.version + ' parentHash mismatch: expected ' + prev.contentHash + ', got ' + v.parentHash);
      }
    }
  }
  return { valid: errors.length === 0, errors, versions: chain.versions.length };
}

/**
 * Verify that a lesson's content matches its claimed hash.
 * @param {object} lessonData
 * @returns {{ valid: boolean, computed: string, claimed: string }}
 */
function verifyContentHash(lessonData) {
  const m = lessonData.meta || lessonData;
  const claimed = m.content_hash || '';
  const computed = computeContentHash(lessonData);
  return { valid: computed === claimed, computed, claimed };
}

// ── Fork permissions ─────────────────────────────────────────────────────────

const FORKABLE_LICENSES = new Set([
  'CC-BY-SA-4.0',
  'CC-BY-4.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-NC-4.0',
  'CC0-1.0',
  'MIT'
]);

const NON_COMMERCIAL_LICENSES = new Set([
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0'
]);

/**
 * Check if a lesson's license permits forking.
 * @param {string} license  SPDX identifier from the source lesson
 * @returns {{ allowed: boolean, reason?: string, nonCommercial?: boolean }}
 */
function checkForkPermission(license) {
  if (!license) {
    return { allowed: false, reason: 'Source lesson has no license specified' };
  }
  if (license === 'All-Rights-Reserved') {
    return { allowed: false, reason: 'Source lesson is All Rights Reserved — forking is not permitted' };
  }
  if (FORKABLE_LICENSES.has(license)) {
    const nc = NON_COMMERCIAL_LICENSES.has(license);
    return {
      allowed: true,
      nonCommercial: nc,
      reason: nc ? 'Non-commercial license — fork must also be non-commercial' : undefined
    };
  }
  return { allowed: false, reason: 'Unknown license "' + license + '" — cannot determine fork permission' };
}

/**
 * Determine which license a forked lesson should inherit based on fork type and source license.
 * SA (ShareAlike) licenses require the fork to use the same license.
 */
function inheritedForkLicense(sourceLicense) {
  const saLicenses = { 'CC-BY-SA-4.0': true, 'CC-BY-NC-SA-4.0': true };
  if (saLicenses[sourceLicense]) return sourceLicense;
  return null; // creator can choose
}

module.exports = {
  computeContentHash,
  shortHash,
  buildUri,
  buildVersionUri,
  parseUri,
  canonicalize,
  loadChain,
  appendVersion,
  getLatestVersion,
  verifyChain,
  verifyContentHash,
  checkForkPermission,
  inheritedForkLicense,
  FORKABLE_LICENSES,
  NON_COMMERCIAL_LICENSES
};
