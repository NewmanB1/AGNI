#!/usr/bin/env node
'use strict';

/**
 * P2-22: Catalog / IR drift validation.
 * Reports catalog-only (in catalog, no IR), IR-only (has IR, not in catalog), YAML-only (has YAML, no IR).
 * Exit 0 if no catalog or no significant drift; 1 if drift detected and --strict.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadJSON(filePath, fallback) {
  if (fallback === undefined) fallback = null;
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function parseArgs() {
  let dataDir = process.env.AGNI_DATA_DIR || path.join(ROOT, 'data');
  let serveDir = process.env.AGNI_SERVE_DIR || path.join(ROOT, 'serve');
  let yamlDir = process.env.AGNI_YAML_DIR || path.join(dataDir, 'yaml');
  let strict = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--data-dir' && process.argv[i + 1]) {
      dataDir = path.resolve(process.argv[i + 1]);
      i += 1;
    } else if (process.argv[i] === '--serve-dir' && process.argv[i + 1]) {
      serveDir = path.resolve(process.argv[i + 1]);
      i += 1;
    } else if (process.argv[i] === '--yaml-dir' && process.argv[i + 1]) {
      yamlDir = path.resolve(process.argv[i + 1]);
      i += 1;
    } else if (process.argv[i] === '--strict') {
      strict = true;
    }
  }
  return { dataDir, serveDir, yamlDir, strict };
}

function main() {
  const { serveDir, yamlDir, strict } = parseArgs();
  const catalogPath = path.join(serveDir, 'catalog.json');
  const lessonsRoot = path.join(serveDir, 'lessons');

  if (!fs.existsSync(catalogPath)) {
    console.log('OK    No catalog.json; nothing to validate (catalog-free mode supported)');
    process.exit(0);
  }

  const catalog = loadJSON(catalogPath, { lessons: [] });
  const catalogSlugSet = new Set();
  (catalog.lessons || []).forEach(function (e) {
    if (e && e.slug) catalogSlugSet.add(e.slug);
  });

  let catalogOrphans = [];
  for (let i = 0; i < (catalog.lessons || []).length; i++) {
    const e = catalog.lessons[i];
    if (!e || !e.slug) continue;
    const irPath = path.join(lessonsRoot, e.slug, 'index-ir.json');
    if (!fs.existsSync(irPath)) catalogOrphans.push(e.slug);
  }

  let irOnly = [];
  if (fs.existsSync(lessonsRoot)) {
    const dirs = fs.readdirSync(lessonsRoot);
    for (let d = 0; d < dirs.length; d++) {
      const slug = dirs[d];
      if (catalogSlugSet.has(slug)) continue;
      if (fs.existsSync(path.join(lessonsRoot, slug, 'index-ir.json'))) {
        irOnly.push(slug);
      }
    }
  }

  let yamlSlugs = [];
  if (fs.existsSync(yamlDir)) {
    yamlSlugs = fs.readdirSync(yamlDir)
      .filter(function (f) { return f.endsWith('.yaml'); })
      .map(function (f) { return f.replace(/\.yaml$/, ''); });
  }
  const yamlOnly = [];
  for (let y = 0; y < yamlSlugs.length; y++) {
    const ys = yamlSlugs[y];
    if (!catalogSlugSet.has(ys) && !fs.existsSync(path.join(lessonsRoot, ys, 'index-ir.json'))) {
      yamlOnly.push(ys);
    }
  }

  const drift = catalogOrphans.length + irOnly.length + yamlOnly.length;
  if (drift > 0) {
    console.warn('Catalog/IR drift (P2-22):', {
      catalogOrphans: catalogOrphans.length,
      irOnly: irOnly.length,
      yamlOnly: yamlOnly.length
    });
    if (catalogOrphans.length) console.warn('  catalogOrphanSlugs:', catalogOrphans.slice(0, 5).join(', '));
    if (irOnly.length) console.warn('  irOnlySlugs:', irOnly.slice(0, 5).join(', '));
    if (yamlOnly.length) console.warn('  yamlOnlySlugs:', yamlOnly.slice(0, 5).join(', '));
  }
  if (drift === 0) {
    console.log('OK    Catalog and IR consistent');
  }
  if (strict && drift > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
