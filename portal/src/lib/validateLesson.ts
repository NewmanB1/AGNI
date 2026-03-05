/**
 * Client-side lesson validation when hub is offline.
 * Mirrors structure and threshold checks from @ols/schema/lesson-schema.
 * Used by LessonEditorCore when api.baseUrl is not configured.
 */

const TOKEN_RE = /\s*(>=|<=|==|!=|>|<|AND\b|[a-zA-Z_][\w.]*|-?[\d.]+g?|[()])\s*/g;

function tokenise(str: string): string[] {
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(str)) !== null) {
    const tok = m[1].trim();
    if (tok) tokens.push(tok);
  }
  return tokens;
}

const ORIENTATION_VALUES = ['flat', 'portrait', 'landscape'];

function parseValue(tok: string): number | string {
  if (!tok) throw new Error('Expected value, got end of input');
  if (/g$/i.test(tok)) return parseFloat(tok) * 9.81;
  if (ORIENTATION_VALUES.indexOf(tok) !== -1) return tok;
  const n = parseFloat(tok);
  if (isNaN(n)) throw new Error('Expected number or orientation, got: ' + tok);
  return n;
}

function parseCondition(tokens: string[], i: number): [unknown, number] {
  const tok = tokens[i];
  if (!tok) throw new Error('Unexpected end of threshold string');

  if (tok === 'steady') {
    const op = tokens[i + 1];
    const durTok = tokens[i + 2] || '';
    let advance = 3;
    if (!/s$/i.test(durTok) && tokens[i + 3] === 's') advance = 4;
    const dur = parseFloat(durTok);
    if (!op || isNaN(dur)) throw new Error('Bad steady condition');
    return [{ type: 'steady', op, duration: dur }, i + advance];
  }

  if (tok === 'freefall') {
    const op2 = tokens[i + 1];
    const durTok2 = tokens[i + 2] || '';
    let advance2 = 3;
    if (!/s$/i.test(durTok2) && tokens[i + 3] === 's') advance2 = 4;
    const dur2 = parseFloat(durTok2);
    if (!op2 || isNaN(dur2)) throw new Error('Bad freefall condition');
    return [{ type: 'freefall', op: op2, duration: dur2 }, i + advance2];
  }

  if (/^[a-zA-Z_][\w.]*$/.test(tok)) {
    const sensorId = tok;
    const op3 = tokens[i + 1];
    const valTok = tokens[i + 2];
    if (!op3 || !valTok) throw new Error('Incomplete condition for: ' + sensorId);
    parseValue(valTok);
    return [{ type: 'sensor', sensorId, op: op3 }, i + 3];
  }

  throw new Error('Unexpected token: ' + tok);
}

function parse(tokens: string[]): unknown {
  if (tokens.length === 0) throw new Error('Empty threshold string');
  let result = parseCondition(tokens, 0);
  let node = result[0];
  let i = result[1];
  while (i < tokens.length) {
    if (tokens[i] !== 'AND') throw new Error('Expected AND, got: ' + tokens[i]);
    const right = parseCondition(tokens, i + 1);
    node = { type: 'and', left: node, right: right[0] };
    i = right[1];
  }
  return node;
}

function validateThresholdSyntax(thresholdStr: string): { valid: boolean; error?: string } {
  try {
    const trimmed = (thresholdStr || '').trim();
    if (!trimmed) return { valid: false, error: 'Empty threshold' };
    const tokens = tokenise(trimmed);
    parse(tokens);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ValidateLessonResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateLessonClient(lessonData: unknown): ValidateLessonResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!lessonData || typeof lessonData !== 'object') {
    return { valid: false, errors: ['Lesson data must be an object'], warnings: [] };
  }

  const lesson = lessonData as Record<string, unknown>;
  const meta = (lesson.meta || lesson) as Record<string, unknown>;
  const steps = lesson.steps;

  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push('Lesson has no steps array');
    return { valid: false, errors, warnings };
  }

  const ids = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>;
    if (step.id) {
      const sid = String(step.id);
      if (ids.has(sid)) errors.push('Duplicate step ID "' + sid + '"');
      ids.add(sid);
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>;
    const label = 'step ' + (i + 1) + ' (' + (step.id || '?') + ')';

    if (!step.type) {
      errors.push(label + ': missing type');
      continue;
    }

    if (step.type === 'hardware_trigger' && step.threshold) {
      const result = validateThresholdSyntax(String(step.threshold));
      if (!result.valid) {
        errors.push(label + ': threshold "' + step.threshold + '" — ' + (result.error || 'invalid'));
      }
    }

    if (step.type === 'quiz') {
      const opts = step.answer_options;
      if (!Array.isArray(opts) || opts.length < 2) {
        errors.push(label + ': quiz needs at least 2 answer_options');
      }
      const ci = step.correct_index;
      if (ci != null && Array.isArray(opts) && (ci < 0 || ci >= opts.length)) {
        errors.push(label + ': correct_index out of bounds');
      }
    }

    if (step.type === 'fill_blank') {
      if (!Array.isArray(step.blanks) || step.blanks.length === 0) {
        errors.push(label + ': fill_blank needs non-empty blanks array');
      }
    }

    if (step.type === 'matching') {
      if (!Array.isArray(step.pairs) || step.pairs.length < 2) {
        errors.push(label + ': matching needs pairs array with at least 2 entries');
      }
    }

    if (step.type === 'ordering') {
      const items = step.items;
      if (!Array.isArray(items) || items.length < 2) {
        errors.push(label + ': ordering needs items array with at least 2 entries');
      }
      const co = step.correct_order;
      if (Array.isArray(items) && (!Array.isArray(co) || co.length !== items.length)) {
        errors.push(label + ': correct_order length must match items length');
      }
    }

    if (step.type === 'svg' && (!step.svg_spec || typeof (step.svg_spec as Record<string, unknown>).factory !== 'string')) {
      errors.push(label + ': svg step needs svg_spec with factory');
    }
  }

  const utu = meta?.utu as Record<string, unknown> | undefined;
  if (utu && typeof utu === 'object') {
    const proto = utu.protocol;
    if (proto != null && (Number(proto) < 1 || Number(proto) > 5)) {
      errors.push('meta.utu.protocol must be 1–5');
    }
    const band = utu.band;
    if (band != null && (Number(band) < 1 || Number(band) > 6)) {
      errors.push('meta.utu.band must be 1–6');
    }
  }

  if (!meta?.description && !lesson.description) {
    warnings.push('Missing description (recommended for discoverability)');
  }
  if (!meta?.time_required && !lesson.time_required) {
    warnings.push('Missing time_required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
