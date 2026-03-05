'use strict';

const fs = require('fs');
const path = require('path');
const { generate } = require('./generator');
const { buildPrompt } = require('./prompt-builder');
const { validateYaml } = require('./lesson-validate');

const PLAN_PATH = path.join(__dirname, '..', 'output', 'lesson-plan.json');
const LESSONS_DIR = path.join(__dirname, '..', 'output', 'lessons');
const PROGRESS_PATH = path.join(__dirname, '..', 'output', 'progress.json');
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// ── Load config ──────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json. Create tools/curriculum-gen/config.json:');
    console.error(JSON.stringify({
      provider: 'gemini',
      apiKey: 'YOUR_API_KEY',
      model: 'gemini-2.0-flash',
      maxTokens: 4096,
      temperature: 0.7,
      rateLimit: { requestsPerMinute: 5, delayMs: 12000 },
      maxRetries: 3,
      batchSize: 20,
      startFrom: 0
    }, null, 2));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ── Load progress ────────────────────────────────────────────────────────────

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  }
  return {
    completed: {},
    failed: {},
    lastIndex: 0,
    stats: {
      totalGenerated: 0,
      totalValid: 0,
      totalInvalid: 0,
      totalRetries: 0,
      totalTokensUsed: 0
    }
  };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

// ── Sleep utility ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ── Progress summary ─────────────────────────────────────────────────────────

function formatProgress(total, completed) {
  const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
  return 'Progress: ' + completed + ' / ' + total + ' (' + pct + '% complete)';
}

// ── Quota detection ──────────────────────────────────────────────────────────

function isQuotaError(message) {
  if (!message || typeof message !== 'string') return false;
  const m = message.toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('rate_limit') ||
    m.includes('resource_exhausted') ||
    m.includes('429') ||
    m.includes('exceeded') && (m.includes('limit') || m.includes('quota'))
  );
}

// ── Process a single lesson ──────────────────────────────────────────────────

async function processLesson(lessonSpec, config, progress) {
  const id = lessonSpec.lessonId;

  if (progress.completed[id]) {
    return { status: 'skipped', id: id };
  }

  const prompt = buildPrompt(lessonSpec);
  let lastError = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      console.log('  [' + attempt + '/' + config.maxRetries + '] Generating...');

      const result = await generate(config, prompt.system, prompt.user);

      if (result.usage) {
        progress.stats.totalTokensUsed += (result.usage.total_tokens || result.usage.totalTokenCount || 0);
      }

      const validation = validateYaml(result.content, lessonSpec);

      const lessonDir = path.join(LESSONS_DIR, lessonSpec.subject, 'grade-' + lessonSpec.grade);
      if (!fs.existsSync(lessonDir)) fs.mkdirSync(lessonDir, { recursive: true });

      const filename = lessonSpec.unit + '--' + lessonSpec.archetype + '.yaml';
      const filepath = path.join(lessonDir, filename);

      // Save the raw YAML regardless of validation
      let cleaned = result.content;
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:yaml|yml)?\n?/, '').replace(/\n?```\s*$/, '');
      }
      fs.writeFileSync(filepath, cleaned);

      // Save gap analysis as a sidecar JSON
      if (validation.gapAnalysis) {
        const gapPath = filepath.replace(/\.yaml$/, '.gaps.json');
        fs.writeFileSync(gapPath, JSON.stringify(validation.gapAnalysis, null, 2));
      }

      if (validation.valid) {
        progress.completed[id] = {
          file: path.relative(path.join(__dirname, '..'), filepath),
          features: validation.features,
          hasGapAnalysis: !!validation.gapAnalysis,
          attempt: attempt,
          timestamp: new Date().toISOString()
        };
        progress.stats.totalGenerated++;
        progress.stats.totalValid++;
        saveProgress(progress);
        return { status: 'valid', id: id, features: validation.features };
      }

      // Invalid but we still saved it — record for later fixing
      if (attempt === config.maxRetries) {
        progress.failed[id] = {
          file: path.relative(path.join(__dirname, '..'), filepath),
          errors: validation.errors,
          warnings: validation.warnings,
          features: validation.features,
          hasGapAnalysis: !!validation.gapAnalysis,
          attempts: attempt,
          timestamp: new Date().toISOString()
        };
        progress.stats.totalGenerated++;
        progress.stats.totalInvalid++;
        saveProgress(progress);
        return { status: 'invalid', id: id, errors: validation.errors };
      }

      progress.stats.totalRetries++;
      console.log('    Validation failed (' + validation.errors.length + ' errors), retrying...');
      lastError = validation.errors.join('; ');

    } catch (e) {
      lastError = e.message;
      console.log('    API error: ' + e.message);
      if (isQuotaError(e.message)) {
        console.log('    Daily quota reached. Stopping. Run again tomorrow to continue.');
        return { status: 'quota_exceeded', id: id, error: e.message };
      }
      if (attempt < config.maxRetries) {
        const backoff = config.rateLimit.delayMs * Math.pow(2, attempt - 1);
        console.log('    Backing off ' + Math.round(backoff / 1000) + 's...');
        await sleep(backoff);
      }
    }
  }

  progress.failed[id] = {
    error: lastError,
    attempts: config.maxRetries,
    timestamp: new Date().toISOString()
  };
  progress.stats.totalInvalid++;
  saveProgress(progress);
  return { status: 'error', id: id, error: lastError };
}

// ── Main runner ──────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    console.error('No lesson plan found. Run: node src/planner.js first');
    process.exit(1);
  }

  const config = loadConfig();
  const progress = loadProgress();
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const batchSize = config.batchSize || 50;
  const skipFailed = config.skipFailed !== false;  // default true: skip previously failed lessons

  // Build queue of lessons to process: exclude completed, optionally exclude failed
  const toProcess = [];
  for (let i = 0; i < plan.lessons.length; i++) {
    const spec = plan.lessons[i];
    if (progress.completed[spec.lessonId]) continue;
    if (skipFailed && progress.failed[spec.lessonId]) continue;
    toProcess.push({ index: i, spec: spec });
  }

  const batch = toProcess.slice(0, batchSize);

  const total = plan.lessons.length;
  const completedCount = Object.keys(progress.completed).length;

  console.log('AGNI Curriculum Generator');
  console.log('========================');
  console.log('Total lessons in plan: ' + total);
  console.log(formatProgress(total, completedCount));
  console.log('Already failed (skipped): ' + (skipFailed ? Object.keys(progress.failed).length : 0));
  console.log('Remaining to process: ' + toProcess.length);
  console.log('This batch: ' + batch.length + ' lessons');
  console.log('Provider: ' + config.provider + ' (' + config.model + ')');
  if (skipFailed && Object.keys(progress.failed).length > 0) {
    console.log('(Run with "skipFailed": false in config to retry failed lessons)');
  }
  console.log('');

  for (let b = 0; b < batch.length; b++) {
    const { index: i, spec } = batch[b];
    console.log('[' + (i + 1) + '/' + plan.lessons.length + '] ' + spec.lessonId);

    const result = await processLesson(spec, config, progress);
    console.log('  → ' + result.status);

    if (result.status === 'quota_exceeded') {
      saveProgress(progress);
      const done = Object.keys(progress.completed).length;
      console.log('\nStopped: API quota reached. Progress saved.');
      console.log(formatProgress(total, done));
      console.log('Run again tomorrow to continue from where you left off.');
      process.exit(0);
    }

    progress.lastIndex = i + 1;
    saveProgress(progress);

    if (result.status !== 'skipped' && b < batch.length - 1) {
      await sleep(config.rateLimit.delayMs || 3000);
    }
  }

  console.log('\nBatch complete.');
  console.log('Valid: ' + progress.stats.totalValid);
  console.log('Invalid: ' + progress.stats.totalInvalid);
  console.log('Total tokens: ' + progress.stats.totalTokensUsed);

  const finalCompleted = Object.keys(progress.completed).length;
  const remaining = toProcess.length - batch.length;
  console.log('\n' + formatProgress(total, finalCompleted));
  if (remaining > 0) {
    console.log(remaining + ' lessons remaining. Run again to continue.');
  }
}

main().catch(function (e) {
  console.error('Fatal: ' + e.message);
  process.exit(1);
});
