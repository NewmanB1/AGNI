#!/usr/bin/env node
'use strict';

/**
 * Validates that .d.ts type declarations match their .js implementations.
 *
 * Checks:
 *   1. Every exported function in .d.ts has a corresponding module.exports in .js
 *   2. Parameter counts match
 *   3. Return type is not 'void' if the .js function has a return statement with a value
 *
 * This is a lightweight static check — not a full type checker. Its purpose is
 * to catch the most common drift: added/removed parameters and wrong return types.
 *
 * Exits non-zero if any mismatch is found.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENGINE_DTS_DIR = path.join(ROOT, 'src', 'engine');
const PACKAGE_ENGINE_DIR = path.join(ROOT, 'packages', 'agni-engine');

const errors = [];

const dtsFiles = fs.readdirSync(ENGINE_DTS_DIR).filter(function (f) {
  return f.endsWith('.d.ts') && f !== 'index.d.ts';
});

function resolveJsPath(dtsName) {
  const jsName = dtsName.replace(/\.d\.ts$/, '.js');
  const srcJsPath = path.join(ENGINE_DTS_DIR, jsName);
  const pkgJsPath = path.join(PACKAGE_ENGINE_DIR, jsName);

  if (!fs.existsSync(srcJsPath)) {
    return { path: null, content: null };
  }

  const srcContent = fs.readFileSync(srcJsPath, 'utf8');
  const reExportMatch = srcContent.match(/module\.exports\s*=\s*require\s*\(\s*['"]@agni\/engine\/[^'"]+['"]\s*\)/);
  if (reExportMatch && fs.existsSync(pkgJsPath)) {
    return { path: pkgJsPath, content: fs.readFileSync(pkgJsPath, 'utf8') };
  }
  return { path: srcJsPath, content: srcContent };
}

dtsFiles.forEach(function (dtsName) {
  const jsName = dtsName.replace(/\.d\.ts$/, '.js');
  const dtsPath = path.join(ENGINE_DTS_DIR, dtsName);
  const resolved = resolveJsPath(dtsName);

  if (!resolved.path || !resolved.content) {
    errors.push(dtsName + ': no corresponding .js file found (' + jsName + ')');
    return;
  }

  const dtsContent = fs.readFileSync(dtsPath, 'utf8');
  const jsContent = resolved.content;

  const dtsFunctions = parseDtsExports(dtsContent);
  const jsFunctions = parseJsExports(jsContent);

  dtsFunctions.forEach(function (dtsFn) {
    const jsFn = jsFunctions.find(function (j) { return j.name === dtsFn.name; });

    if (!jsFn) {
      errors.push(dtsName + ': declares export "' + dtsFn.name + '" not found in ' + jsName);
      return;
    }

    if (dtsFn.paramCount !== jsFn.paramCount) {
      errors.push(
        dtsName + ': "' + dtsFn.name + '" has ' + dtsFn.paramCount +
        ' param(s) in .d.ts but ' + jsFn.paramCount + ' in .js'
      );
    }

    if (dtsFn.returnType === 'void' && jsFn.hasValueReturn) {
      errors.push(
        dtsName + ': "' + dtsFn.name + '" declared as returning void but .js has a return-value statement'
      );
    }
  });
});

function parseDtsExports(content) {
  const results = [];
  const re = /export\s+function\s+(\w+)\s*\(([^)]*)\)\s*:\s*([^;]+)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const params = match[2].trim();
    const paramCount = params === '' ? 0 : params.split(',').length;
    const returnType = match[3].trim();
    results.push({ name: match[1], paramCount: paramCount, returnType: returnType });
  }
  return results;
}

function parseJsExports(content) {
  const results = [];

  const exportBlock = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (!exportBlock) return results;

  const exportedNames = exportBlock[1].match(/(\w+)\s*:/g);
  if (!exportedNames) return results;

  exportedNames.forEach(function (raw) {
    const name = raw.replace(/\s*:/, '');

    const fnPatterns = [
      new RegExp('function\\s+' + escapeRegex(name) + '\\s*\\(([^)]*)\\)'),
      new RegExp('(?:var|let|const)\\s+' + escapeRegex(name) + '\\s*=\\s*function\\s*\\(([^)]*)\\)')
    ];

    let paramCount = null;
    for (let i = 0; i < fnPatterns.length; i++) {
      const m = content.match(fnPatterns[i]);
      if (m) {
        const params = m[1].trim();
        paramCount = params === '' ? 0 : params.split(',').length;
        break;
      }
    }

    if (paramCount === null) return;

    const fnBody = extractFunctionBody(content, name);
    let hasValueReturn = false;
    if (fnBody) {
      hasValueReturn = hasTopLevelValueReturn(fnBody);
    }

    results.push({ name: name, paramCount: paramCount, hasValueReturn: hasValueReturn });
  });

  return results;
}

function extractFunctionBody(content, fnName) {
  const startRe = new RegExp('function\\s+' + escapeRegex(fnName) + '\\s*\\([^)]*\\)\\s*\\{');
  const match = startRe.exec(content);
  if (!match) return null;

  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return content.slice(start, i - 1);
}

function hasTopLevelValueReturn(body) {
  let depth = 0;
  const re = /(?:function\s*(?:\w+)?\s*\([^)]*\)\s*\{|\{|\}|\breturn\b\s*([^;}\s]?))/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const token = m[0];
    if (token === '{') {
      depth++;
    } else if (token === '}') {
      depth--;
    } else if (token.startsWith('function')) {
      depth++;
    } else if (token.startsWith('return') && depth === 0) {
      if (m[1] && m[1] !== '') return true;
    }
  }
  return false;
}

function escapeRegex(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

if (errors.length > 0) {
  console.error('FAIL: ' + errors.length + ' .d.ts/js mismatch(es):\n');
  errors.forEach(function (e) { console.error('  ' + e); });
  console.error('\nUpdate the .d.ts files to match the .js implementations.');
  process.exit(1);
} else {
  console.log('OK: All .d.ts declarations match their .js implementations (' + dtsFiles.length + ' pairs checked).');
}
