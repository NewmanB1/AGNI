'use strict';

// Evaluate a single lesson (sidecar) against a governance policy.
// Returns status and a list of structured issues for authoring tools and hub APIs.
// When opts.utuConstants is provided, uses it (pure, no I/O). Otherwise loads from envConfig.utuConstantsPath.

const fs = require('fs');
const envConfig = require('@agni/utils/env-config');

let _utuCache = null;
function loadUtuConstantsFromPath(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { return {}; }
}

function resolveUtuConstants(opts) {
  if (opts && opts.utuConstants && typeof opts.utuConstants === 'object') return opts.utuConstants;
  if (!_utuCache) _utuCache = loadUtuConstantsFromPath(envConfig.utuConstantsPath);
  return _utuCache || {};
}

function getFailureModeForProtocol(protocol, utuConstants) {
  const protocols = (utuConstants.protocols || []);
  const p = protocols.find(function (x) { return x.id === protocol; });
  return p ? p.failureMode : null;
}

function getCanonicalSpineIds(utuConstants) {
  return utuConstants.spineIds || [];
}

function issue(message, severity) {
  return { message: message, severity: severity };
}

/**
 * Evaluate lesson compliance against policy.
 * When opts.utuConstants is provided: pure (no I/O). Otherwise loads UTU constants from envConfig.utuConstantsPath.
 *
 * @param  {object} sidecar  Lesson sidecar (identifier, utu, teaching_mode, difficulty, ontology, ...)
 * @param  {object} policy   Optional. { allowedTeachingModes?, requireUtu?, requireTeachingMode?, allowedProtocols?, minProtocol?, maxProtocol?, failureModeHints?, minDifficulty?, maxDifficulty? }
 * @param  {object} opts     Optional. { utuConstants?: object } — when provided, used instead of file load (enables pure testing)
 * @returns {{ status: 'ok'|'warning'|'fail', issues: Array<{ message: string, severity: 'fail'|'warning' }> }}
 */
function evaluateLessonCompliance(sidecar, policy, opts) {
  policy = policy || {};
  const utuConstants = resolveUtuConstants(opts || {});
  const issues = [];

  if (policy.requireUtu && (!sidecar.utu || !sidecar.utu.class)) {
    issues.push(issue('Lesson has no UTU label; policy requires meta.utu.class.', 'warning'));
  }

  // Portability check: validate Spine ID against canonical list
  const lessonSpineId = sidecar.utu && sidecar.utu.class;
  if (lessonSpineId) {
    const canonical = getCanonicalSpineIds(utuConstants);
    if (canonical.length > 0 && canonical.indexOf(lessonSpineId) === -1) {
      issues.push(issue('Spine ID "' + lessonSpineId + '" is not in canonical list. Lesson may not be portable across authorities.', 'warning'));
    }
  }

  // UTU target matching: check lesson coordinates against policy targets
  const targets = policy.utuTargets;
  if (Array.isArray(targets) && targets.length > 0 && sidecar.utu) {
    const utu = sidecar.utu;
    const matchesTarget = targets.some(function (t) {
      if (t.class !== utu.class) return false;
      if (typeof t.band === 'number' && t.band !== utu.band) return false;
      if (typeof t.protocol === 'number' && t.protocol !== utu.protocol) return false;
      return true;
    });
    if (!matchesTarget && policy.requireUtu) {
      const targetStr = targets.map(function (t) {
        let s = t.class + '-B' + t.band;
        if (typeof t.protocol === 'number') s += '-P' + t.protocol;
        return s;
      }).join(', ');
      issues.push(issue('Lesson UTU coordinate (' + (utu.class || '?') + '-B' + (utu.band || '?') + '-P' + (utu.protocol || '?') + ') does not match any policy target: ' + targetStr, 'fail'));
    }
  }

  if (policy.requireTeachingMode && !sidecar.teaching_mode) {
    issues.push(issue('Lesson has no teaching_mode; policy requires meta.teaching_mode.', 'warning'));
  }

  const allowedModes = policy.allowedTeachingModes;
  if (Array.isArray(allowedModes) && allowedModes.length > 0 && sidecar.teaching_mode) {
    if (allowedModes.indexOf(sidecar.teaching_mode) === -1) {
      issues.push(issue('teaching_mode "' + sidecar.teaching_mode + '" is not in allowed list: ' + allowedModes.join(', '), 'fail'));
    }
  }

  // Protocol progression (P1–P5): allowedProtocols or minProtocol/maxProtocol
  const lessonProtocol = sidecar.utu && typeof sidecar.utu.protocol === 'number' ? sidecar.utu.protocol : null;
  const allowedProtocols = policy.allowedProtocols;
  const minP = policy.minProtocol;
  const maxP = policy.maxProtocol;
  const addFailureHint = !!policy.failureModeHints;

  if (typeof lessonProtocol === 'number') {
    let protocolFail = false;
    if (Array.isArray(allowedProtocols) && allowedProtocols.length > 0) {
      if (allowedProtocols.indexOf(lessonProtocol) === -1) {
        protocolFail = true;
        issues.push(issue('Lesson protocol P' + lessonProtocol + ' is not in allowed protocols: ' + allowedProtocols.map(function (n) { return 'P' + n; }).join(', '), 'fail'));
      }
    } else if (typeof minP === 'number' || typeof maxP === 'number') {
      if (typeof minP === 'number' && lessonProtocol < minP) {
        protocolFail = true;
        issues.push(issue('Lesson protocol P' + lessonProtocol + ' is below policy minimum P' + minP, 'fail'));
      }
      if (typeof maxP === 'number' && lessonProtocol > maxP) {
        protocolFail = true;
        issues.push(issue('Lesson protocol P' + lessonProtocol + ' exceeds policy maximum P' + maxP, 'fail'));
      }
    }
    if (protocolFail && addFailureHint) {
      const hint = getFailureModeForProtocol(lessonProtocol, utuConstants);
      if (hint) issues.push(issue('Failure-mode hint (P' + lessonProtocol + '): ' + hint, 'warning'));
    }
  } else if (((allowedProtocols && allowedProtocols.length > 0) || typeof minP === 'number' || typeof maxP === 'number') && policy.requireUtu) {
    issues.push(issue('Lesson has no meta.utu.protocol; policy enforces protocol bounds.', 'fail'));
  }

  // Feature inference confidence check
  const inferredFeatures = sidecar.inferredFeatures;
  if (inferredFeatures && inferredFeatures.confidence) {
    const conf = inferredFeatures.confidence;
    const srcs = inferredFeatures.featureSources || {};
    if (conf.blooms < 0.3 && srcs.blooms !== 'declared') {
      issues.push(issue('Low confidence in inferred Bloom\'s level (' + (conf.blooms * 100).toFixed(0) + '%). Consider adding meta.declared_features.blooms_level.', 'warning'));
    }
    if (conf.vark < 0.3 && srcs.vark !== 'declared') {
      issues.push(issue('Low confidence in inferred VARK profile (' + (conf.vark * 100).toFixed(0) + '%). Consider adding meta.declared_features.vark.', 'warning'));
    }
    if (conf.teachingStyle < 0.3 && srcs.teachingStyle !== 'declared') {
      issues.push(issue('Low confidence in inferred teaching style (' + (conf.teachingStyle * 100).toFixed(0) + '%). Consider adding meta.declared_features.teaching_style.', 'warning'));
    }
  }

  const difficulty = sidecar.difficulty;
  if (typeof difficulty === 'number') {
    if (typeof policy.minDifficulty === 'number' && difficulty < policy.minDifficulty) {
      issues.push(issue('Lesson difficulty ' + difficulty + ' is below policy minimum ' + policy.minDifficulty, 'fail'));
    }
    if (typeof policy.maxDifficulty === 'number' && difficulty > policy.maxDifficulty) {
      issues.push(issue('Lesson difficulty ' + difficulty + ' exceeds policy maximum ' + policy.maxDifficulty, 'fail'));
    }
  }

  const status = classifyIssues(issues);
  return { status: status, issues: issues };
}

function classifyIssues(issues) {
  if (issues.length === 0) return 'ok';
  return issues.some(function (i) { return i.severity === 'fail'; }) ? 'fail' : 'warning';
}

module.exports = {
  evaluateLessonCompliance: evaluateLessonCompliance
};
