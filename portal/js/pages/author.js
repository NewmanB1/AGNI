/**
 * Lesson Author — form-based editor (R7: The Editor).
 * Vanilla JS, uses author API: load, validate, preview, save.
 */
import { getHubUrl, createHubApi } from '../api.js';
import { restoreCreatorSession, setCreatorSession, clearCreatorSession, getStoredToken } from '../auth.js';
import { navigateTo } from '../router.js';
import { openSVGFactoryWizard } from '../wizards/svg-factory-wizard.js';
import { openSensorToyWizard } from '../wizards/sensor-toy-wizard.js';
import { consumeWizardDraft, renderLessonCreationWizard } from '../wizards/lesson-creation-wizard.js';

export function renderAuthorList(main) {
  const token = getStoredToken();
  if (!token) {
    main.innerHTML = `
      <div class="top-page">
        <h1>Lesson Author</h1>
        <p>You must be logged in to author lessons.</p>
        <a href="#/author/login" class="btn btn-primary">Log In or Register</a>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="top-page">
      <h1>Lesson Author</h1>
      <p style="margin-bottom: 1rem;">Create or edit lessons.</p>
      <a href="#/author/wizard" class="btn btn-primary">Create with wizard</a>
      <a href="#/author/new" class="btn">Create New Lesson (blank)</a>
      <div class="card" style="margin-top: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Edit existing</h3>
        <p class="hint" style="margin-bottom: 0.5rem;">Select a lesson or enter slug to edit.</p>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
          <select id="edit-select" class="input" style="min-width: 200px;">
            <option value="">-- Select lesson --</option>
          </select>
          <span>or</span>
          <input type="text" id="edit-slug" class="input" placeholder="hello-world" style="max-width: 180px;" />
          <button type="button" id="btn-edit" class="btn">Edit</button>
        </div>
      </div>
      <p style="margin-top: 1.5rem;"><a href="#/author/login">Account / Log out</a></p>
    </div>
  `;
  var baseUrl = getHubUrl();
  if (baseUrl) {
    var api = createHubApi(baseUrl);
    api.getAuthorLessons().then(function (r) {
      var sel = main.querySelector('#edit-select');
      if (!sel || !r.slugs) return;
      (r.slugs || []).sort().forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        sel.appendChild(opt);
      });
    }).catch(function () {});
  }
  function doEdit() {
    var sel = main.querySelector('#edit-select');
    var inp = main.querySelector('#edit-slug');
    var slug = (sel && sel.value) || (inp && inp.value) || '';
    slug = String(slug).trim().replace(/\.yaml$/, '');
    if (slug) navigateTo('#/author/' + encodeURIComponent(slug) + '/edit');
  }
  main.querySelector('#btn-edit').addEventListener('click', doEdit);
  main.querySelector('#edit-select')?.addEventListener('change', function () {
    if (this.value) doEdit();
  });
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Default sensor list when API has not returned; matches @agni/plugins builtins. */
var DEFAULT_SENSORS = [
  { id: 'accel.total', label: 'Accel+G total', group: 'Accelerometer' },
  { id: 'shake', label: 'Shake detected', group: 'Accelerometer' },
  { id: 'accel.x', label: 'Accel X', group: 'Accelerometer' },
  { id: 'gyro.x', label: 'Gyro X', group: 'Gyroscope' },
  { id: 'orientation', label: 'Screen position', group: 'Orientation' }
];

var authorSensorCache = [];
var authorEditorContext = null;

function getSensorsForDropdown() {
  return authorSensorCache.length ? authorSensorCache : DEFAULT_SENSORS;
}

function buildSensorOptionsHtml(selectedId) {
  var sensors = getSensorsForDropdown();
  var found = false;
  var opts = sensors.map(function (s) {
    var sel = (s.id === selectedId) ? (found = true, ' selected') : '';
    return '<option value="' + esc(s.id) + '"' + sel + '>' + esc(s.label) + ' (' + esc(s.id) + ')</option>';
  }).join('');
  if (selectedId && !found) {
    opts = '<option value="' + esc(selectedId) + '" selected>' + esc(selectedId) + '</option>' + opts;
  }
  return opts;
}

/**
 * Y6: Merge form data with original lesson to preserve schema fidelity.
 * Keeps fields we don't collect (utu, on_success, on_fail, max_attempts, feedback, etc.).
 */
function mergeLessonForRoundTrip(original, formData) {
  if (!original || !formData) return formData;
  var merged = {};
  for (var k in original) merged[k] = original[k];
  merged.version = formData.version || merged.version;
  merged.meta = shallowMerge(original.meta || {}, formData.meta || {});
  var origSteps = original.steps || [];
  var origById = {};
  for (var i = 0; i < origSteps.length; i++) {
    var oid = origSteps[i].id;
    if (oid && !origById[oid]) origById[oid] = origSteps[i];
  }
  merged.steps = formData.steps.map(function (fs) {
    var orig = (fs.id && origById[fs.id]) || {};
    return shallowMerge(orig, fs);
  });
  merged.ontology = formData.ontology || original.ontology;
  merged.gate = formData.gate;
  return merged;
}

function shallowMerge(base, overlay) {
  var out = {};
  for (var k in base) out[k] = base[k];
  for (var k in overlay) {
    if (overlay[k] !== undefined && overlay[k] !== null) out[k] = overlay[k];
  }
  return out;
}

export function renderAuthorLogin(main) {
  const baseUrl = getHubUrl();
  main.innerHTML = `
    <div class="top-page">
      <h1>Creator Login</h1>
      <p style="margin-bottom: 1rem;">Log in or register to author lessons.</p>

      <div class="card" style="max-width: 400px;">
        <p class="hint" style="margin-bottom: 1rem;">Hub: ${esc(baseUrl || 'Not set')}</p>
        <form id="login-form">
          <div style="margin-bottom: 1rem;">
            <label for="email">Email</label>
            <input type="email" id="email" required placeholder="you@example.com" />
          </div>
          <div style="margin-bottom: 1rem;">
            <label for="password">Password</label>
            <input type="password" id="password" required placeholder="8+ characters" />
          </div>
          <div style="margin-bottom: 1rem;">
            <label for="register-name">Name (for registration only)</label>
            <input type="text" id="register-name" placeholder="Your name" />
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="submit" class="btn btn-primary" id="login-btn">Log In</button>
            <button type="button" class="btn" id="register-btn">Register</button>
          </div>
        </form>
        <p id="auth-status" style="margin-top: 0.5rem;"></p>
      </div>

      <p style="margin-top: 1rem;"><a href="#/">← Back</a></p>
    </div>
  `;

  const form = main.querySelector('#login-form');
  const status = main.querySelector('#auth-status');

  if (!baseUrl) {
    status.textContent = 'Set Hub URL in Settings first.';
    status.className = 'error-box';
    return;
  }

  const api = createHubApi(baseUrl);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = main.querySelector('#email').value;
    const password = main.querySelector('#password').value;
    status.textContent = 'Logging in…';
    try {
      const res = await api.postAuthLogin({ email, password });
      setCreatorSession(res.token, res.creator);
      status.textContent = 'Logged in.';
      status.className = 'success-box';
      setTimeout(function () { navigateTo('#/author/new'); }, 500);
    } catch (err) {
      const msg = err.message || '';
      status.textContent = msg === 'Failed to fetch'
        ? 'Cannot reach hub at ' + baseUrl + '. Is it running? Check Settings.'
        : (msg || 'Login failed.');
      status.className = 'error-box';
    }
  });

  main.querySelector('#register-btn').addEventListener('click', async function () {
    const name = (main.querySelector('#register-name').value || '').trim();
    const email = main.querySelector('#email').value;
    const password = main.querySelector('#password').value;
    if (!name || !email || !password) {
      status.textContent = 'Enter name, email, and password (8+ chars).';
      status.className = 'error-box';
      return;
    }
    status.textContent = 'Registering…';
    try {
      const res = await api.postAuthRegister({ name, email, password });
      setCreatorSession(res.token, res.creator);
      status.textContent = 'Registered.';
      status.className = 'success-box';
      setTimeout(function () { navigateTo('#/author/new'); }, 500);
    } catch (err) {
      const msg = err.message || '';
      status.textContent = msg === 'Failed to fetch'
        ? 'Cannot reach hub at ' + baseUrl + '. Is it running? Check Settings.'
        : (msg || 'Registration failed.');
      status.className = 'error-box';
    }
  });
}

function defaultLesson() {
  return {
    version: '1.8.0',
    meta: {
      identifier: 'ols:custom:lesson_v1',
      title: 'Untitled Lesson',
      description: '',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: new Date().toISOString(),
      difficulty: 1,
      tags: [],
      time_required: 'PT5M'
    },
    steps: [
      { id: 'step1', type: 'instruction', content: '## Welcome\n\nAdd your content here (Markdown supported).' },
      { id: 'step2', type: 'completion', content: '## Done!\n\nYou completed this lesson.' }
    ],
    ontology: { requires: [], provides: [] },
    gate: null  // optional: { type: 'quiz'|'manual_verification', question, expected_answer, ... }
  };
}

function collectLessonFromForm(main) {
  var metaId = main.querySelector('#meta-identifier')?.value?.trim() || 'ols:custom:untitled_v1';
  var metaTitle = main.querySelector('#meta-title')?.value?.trim() || 'Untitled';
  var metaDesc = main.querySelector('#meta-description')?.value?.trim() || '';
  var metaLang = main.querySelector('#meta-language')?.value?.trim() || 'en';
  var metaLicense = main.querySelector('#meta-license')?.value?.trim() || 'CC-BY-SA-4.0';
  var metaCreated = main.querySelector('#meta-created')?.value?.trim() || new Date().toISOString();
  var metaDifficulty = parseInt(main.querySelector('#meta-difficulty')?.value, 10) || 1;
  var metaTags = (main.querySelector('#meta-tags')?.value?.trim() || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  var metaTime = main.querySelector('#meta-time')?.value?.trim() || 'PT5M';
  var utuSpine = (main.querySelector('#meta-utu-spine')?.value || '').trim();
  var utuBandVal = main.querySelector('#meta-utu-band')?.value;
  var utuProtocolVal = main.querySelector('#meta-utu-protocol')?.value;
  var utuBand = utuBandVal ? parseInt(utuBandVal, 10) : null;
  var utuProtocol = utuProtocolVal ? parseInt(utuProtocolVal, 10) : null;

  var meta = {
    identifier: metaId,
    title: metaTitle,
    description: metaDesc,
    language: metaLang,
    license: metaLicense,
    created: metaCreated,
    difficulty: metaDifficulty,
    tags: metaTags,
    time_required: metaTime
  };
  meta.utu = {};
  if (utuSpine) meta.utu.spineId = utuSpine;
  if (utuBand >= 1 && utuBand <= 6) meta.utu.band = utuBand;
  if (utuProtocol >= 1 && utuProtocol <= 5) meta.utu.protocol = utuProtocol;

  var steps = [];
  main.querySelectorAll('.step-card').forEach(function (card, idx) {
    var idEl = card.querySelector('.step-id');
    var typeEl = card.querySelector('.step-type');
    var contentEl = card.querySelector('.step-content');
    var id = (idEl && idEl.value.trim()) || ('step' + (idx + 1));
    var type = (typeEl && typeEl.value) || 'instruction';
    var content = (contentEl && contentEl.value.trim()) || '';

    var step = { id: id, type: type, content: content };

    if (type === 'quiz') {
      var opts = [];
      card.querySelectorAll('.quiz-option').forEach(function (o) {
        opts.push(o.value.trim());
      });
      var correctIdx = parseInt(card.querySelector('.quiz-correct')?.value, 10) || 0;
      step.answer_options = opts.length ? opts : ['Option A', 'Option B'];
      step.correct_index = Math.min(correctIdx, step.answer_options.length - 1);
    }
    if (type === 'hardware_trigger') {
      step.sensor = (card.querySelector('.step-sensor')?.value || 'accel.total').trim();
      step.threshold = (card.querySelector('.step-threshold')?.value || 'freefall > 0.3s').trim();
    }
    if (type === 'fill_blank') {
      var blanks = [];
      card.querySelectorAll('.fill-blank-row').forEach(function (row) {
        var ans = row.querySelector('.blank-answer')?.value?.trim();
        var acc = row.querySelector('.blank-accept')?.value?.trim();
        if (ans) blanks.push({ answer: ans, accept: acc ? acc.split(/\s*,\s*/).map(function (s) { return s.trim(); }).filter(Boolean) : undefined });
      });
      step.blanks = blanks.length ? blanks : [{ answer: 'answer' }];
    }
    if (type === 'matching') {
      var pairs = [];
      card.querySelectorAll('.matching-pair-row').forEach(function (row) {
        var left = row.querySelector('.pair-left')?.value?.trim();
        var right = row.querySelector('.pair-right')?.value?.trim();
        if (left || right) pairs.push({ left: left || '', right: right || '' });
      });
      step.pairs = pairs.length >= 2 ? pairs : [{ left: 'A', right: '1' }, { left: 'B', right: '2' }];
    }
    if (type === 'ordering') {
      var items = [];
      card.querySelectorAll('.ordering-item').forEach(function (inp) {
        var v = inp.value?.trim();
        if (v) items.push(v);
      });
      step.items = items.length >= 2 ? items : ['First', 'Second', 'Third'];
      step.correct_order = step.items.map(function (_, i) { return i; });
    }
    if (type === 'svg') {
      var svgSpecEl = card.querySelector('.step-svg-spec');
      if (svgSpecEl && svgSpecEl.value) {
        try {
          step.svg_spec = JSON.parse(svgSpecEl.value);
        } catch (e) { step.svg_spec = { factory: 'barGraph', opts: {} }; }
      } else {
        step.svg_spec = { factory: 'barGraph', opts: { w: 420, h: 280 } };
      }
    }

    steps.push(step);
  });

  var ontology = { requires: [], provides: [] };
  var reqEl = main.querySelector('#ontology-requires');
  var provEl = main.querySelector('#ontology-provides');
  if (reqEl && reqEl.value.trim()) {
    ontology.requires = reqEl.value.trim().split(/\s*,\s*/).filter(Boolean).map(function (s) { return { skill: s.trim(), level: 1 }; });
  }
  if (provEl && provEl.value.trim()) {
    ontology.provides = provEl.value.trim().split(/\s*,\s*/).filter(Boolean).map(function (s) { return { skill: s.trim(), level: 1 }; });
  }

  var gate = null;
  var gateEnabled = main.querySelector('#gate-enabled')?.checked;
  if (gateEnabled) {
    var gt = (main.querySelector('#gate-type')?.value || 'quiz').trim();
    gate = { type: gt };
    var gst = main.querySelector('#gate-skill-target')?.value?.trim();
    if (gst) gate.skill_target = gst;
    var gq = main.querySelector('#gate-question')?.value?.trim();
    if (gq) gate.question = gq;
    var gea = main.querySelector('#gate-expected-answer')?.value?.trim();
    if (gea) gate.expected_answer = gea;
    var gof = main.querySelector('#gate-on-fail')?.value?.trim();
    if (gof) gate.on_fail = gof;
    var gps = parseFloat(main.querySelector('#gate-passing-score')?.value);
    if (!isNaN(gps) && gps >= 0 && gps <= 1) gate.passing_score = gps;
    var grd = main.querySelector('#gate-retry-delay')?.value?.trim();
    if (grd) gate.retry_delay = grd;
  }

  return {
    version: '1.8.0',
    meta: meta,
    steps: steps,
    ontology: (ontology.requires && ontology.requires.length) || (ontology.provides && ontology.provides.length) ? ontology : undefined,
    gate: gate
  };
}

function populateFormFromLesson(main, lesson) {
  var m = lesson.meta || {};
  var set = function (sel, val) {
    var el = main.querySelector(sel);
    if (el) el.value = val || '';
  };
  set('#meta-identifier', m.identifier);
  set('#meta-title', m.title);
  set('#meta-description', m.description);
  set('#meta-language', m.language);
  set('#meta-license', m.license);
  set('#meta-created', (m.created || '').replace('Z', '').slice(0, 19));
  set('#meta-difficulty', m.difficulty || 1);
  set('#meta-tags', Array.isArray(m.tags) ? m.tags.join(', ') : '');
  set('#meta-time', m.time_required || 'PT5M');
  var utu = m.utu || {};
  set('#meta-utu-spine', utu.spineId || utu.class || '');
  set('#meta-utu-band', utu.band != null && utu.band >= 1 && utu.band <= 6 ? String(utu.band) : '');
  set('#meta-utu-protocol', utu.protocol != null && utu.protocol >= 1 && utu.protocol <= 5 ? String(utu.protocol) : '');

  var onEl = main.querySelector('#ontology-requires');
  var opEl = main.querySelector('#ontology-provides');
  if (onEl && lesson.ontology && lesson.ontology.requires && lesson.ontology.requires.length) {
    onEl.value = lesson.ontology.requires.map(function (r) { return r.skill || r; }).join(', ');
  }
  if (opEl && lesson.ontology && lesson.ontology.provides && lesson.ontology.provides.length) {
    opEl.value = lesson.ontology.provides.map(function (p) { return p.skill || p; }).join(', ');
  }

  var gateEl = main.querySelector('#gate-enabled');
  var gateFields = main.querySelector('#gate-fields');
  if (gateEl && lesson.gate && lesson.gate.type) {
    gateEl.checked = true;
    if (gateFields) gateFields.style.display = 'block';
    var g = lesson.gate;
    var gset = function (sel, val) { var e = main.querySelector(sel); if (e) e.value = val || ''; };
    gset('#gate-type', g.type);
    gset('#gate-skill-target', g.skill_target);
    gset('#gate-question', g.question);
    gset('#gate-expected-answer', g.expected_answer);
    gset('#gate-on-fail', g.on_fail);
    gset('#gate-passing-score', g.passing_score != null ? g.passing_score : '');
    gset('#gate-retry-delay', g.retry_delay);
  } else if (gateEl) {
    gateEl.checked = false;
    if (gateFields) gateFields.style.display = 'none';
  }

  var container = main.querySelector('#steps-container');
  if (!container) return;
  container.innerHTML = '';
  (lesson.steps || []).forEach(function (step, i) {
    appendStepCard(container, step, i);
  });
}

/** Refresh Step 1, Step 2, ... labels after reorder. */
function refreshStepNumbers(container) {
  if (!container) return;
  container.querySelectorAll('.step-card').forEach(function (card, i) {
    var span = card.querySelector('.step-number');
    if (span) span.textContent = 'Step ' + (i + 1);
    card.dataset.idx = String(i);
  });
}

/** Allow dropping on container's empty area to move step to end. */
function wireStepsContainerDragDrop(container) {
  if (!container) return;
  container.addEventListener('dragover', function (e) {
    if (e.target.closest('.step-card')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  container.addEventListener('drop', function (e) {
    if (e.target.closest('.step-card')) return;
    e.preventDefault();
    var fromIdx = parseInt(e.dataTransfer.getData('application/x-agni-step-index'), 10);
    if (isNaN(fromIdx)) return;
    var cards = container.querySelectorAll('.step-card');
    var fromCard = cards[fromIdx];
    if (!fromCard) return;
    container.appendChild(fromCard);
    refreshStepNumbers(container);
  });
}

/** Wire native HTML5 drag-and-drop for step reorder (R7-future). */
function wireStepDragDrop(container, card, idx) {
  var handle = card.querySelector('.step-drag-handle');
  if (!handle) return;
  handle.addEventListener('dragstart', function (e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
    e.dataTransfer.setData('application/x-agni-step-index', String(idx));
    card.classList.add('step-dragging');
  });
  handle.addEventListener('dragend', function () {
    card.classList.remove('step-dragging');
    container.querySelectorAll('.step-card').forEach(function (c) { c.classList.remove('step-drag-over'); });
  });
  card.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (card.classList.contains('step-dragging')) return;
    card.classList.add('step-drag-over');
  });
  card.addEventListener('dragleave', function () {
    card.classList.remove('step-drag-over');
  });
  card.addEventListener('drop', function (e) {
    e.preventDefault();
    card.classList.remove('step-drag-over');
    var fromIdx = parseInt(e.dataTransfer.getData('application/x-agni-step-index'), 10);
    if (isNaN(fromIdx)) return;
    var cards = Array.prototype.slice.call(container.querySelectorAll('.step-card'));
    var fromCard = cards[fromIdx];
    if (!fromCard || fromCard === card) return;
    container.insertBefore(fromCard, card);
    refreshStepNumbers(container);
  });
}

function appendStepCard(container, step, idx) {
  step = step || { id: 'step' + (idx + 1), type: 'instruction', content: '' };
  var type = step.type || 'instruction';
  var card = document.createElement('div');
  card.className = 'step-card card';
  card.dataset.idx = String(idx);

  var optsHtml = '';
  if (type === 'quiz') {
    var opts = step.answer_options || ['Option A', 'Option B'];
    optsHtml = opts.map(function (o, i) {
      return '<div class="quiz-opt-row"><input type="text" class="input quiz-option" value="' + esc(String(o)) + '" placeholder="Option ' + (i + 1) + '" /><button type="button" class="btn btn-remove-opt" data-idx="' + i + '">−</button></div>';
    }).join('');
    optsHtml += '<div><label>Correct index (0-based)</label><input type="number" class="input quiz-correct" min="0" value="' + (step.correct_index || 0) + '" /></div>';
  }
  if (type === 'hardware_trigger') {
    optsHtml = '<div><label>Sensor</label><select class="input step-sensor">' + buildSensorOptionsHtml(step.sensor) + '</select></div>';
    optsHtml += '<div><label>Threshold (e.g. freefall &gt; 0.3s, accel.total &gt; 2.5g)</label><input type="text" class="input step-threshold" value="' + esc(step.threshold || 'freefall > 0.3s') + '" placeholder="freefall > 0.3s" /><span class="threshold-error hint" style="display:none;color:#c00;"></span></div>';
  }
  if (type === 'fill_blank') {
    var blanks = step.blanks || [{ answer: 'answer' }];
    optsHtml = '<p class="hint">Use ___ in content for each blank. One blank definition per ___.</p>';
    optsHtml += blanks.map(function (b, i) {
      var acc = (b.accept || []).join(', ');
      return '<div class="fill-blank-row"><input type="text" class="input blank-answer" value="' + esc(b.answer || '') + '" placeholder="Correct answer" /><input type="text" class="input blank-accept" value="' + esc(acc) + '" placeholder="Alternatives (comma)" /><button type="button" class="btn btn-remove-blank">−</button></div>';
    }).join('');
    optsHtml += '<button type="button" class="btn btn-add-blank">+ Add blank</button>';
  }
  if (type === 'matching') {
    var pairs = step.pairs || [{ left: 'A', right: '1' }, { left: 'B', right: '2' }];
    optsHtml = pairs.map(function (p, i) {
      return '<div class="matching-pair-row"><input type="text" class="input pair-left" value="' + esc(p.left || '') + '" placeholder="Left" /><input type="text" class="input pair-right" value="' + esc(p.right || '') + '" placeholder="Right" /><button type="button" class="btn btn-remove-pair">−</button></div>';
    }).join('');
    optsHtml += '<button type="button" class="btn btn-add-pair">+ Add pair</button>';
  }
  if (type === 'ordering') {
    var items = step.items || ['First', 'Second', 'Third'];
    optsHtml = '<p class="hint">Items in correct order (runtime shuffles for learner).</p>';
    optsHtml += items.map(function (it, i) {
      return '<div class="ordering-row"><input type="text" class="input ordering-item" value="' + esc(it || '') + '" placeholder="Item ' + (i + 1) + '" /><button type="button" class="btn btn-remove-ordering">−</button></div>';
    }).join('');
    optsHtml += '<button type="button" class="btn btn-add-ordering">+ Add item</button>';
  }
  if (type === 'svg') {
    var spec = step.svg_spec || { factory: 'barGraph', opts: {} };
    var specJson = '';
    try { specJson = JSON.stringify(spec); } catch (e) {}
    var summary = spec.factory || 'No SVG';
    if (spec.opts && (spec.opts.w || spec.opts.h)) summary += ' ' + (spec.opts.w || 420) + '×' + (spec.opts.h || 280);
    optsHtml = '<div class="step-svg-config"><input type="hidden" class="input step-svg-spec" value="' + esc(specJson) + '"/>' +
      '<span class="step-svg-summary">' + esc(summary) + '</span> <button type="button" class="btn btn-configure-svg">Configure SVG</button></div>';
  }

  card.innerHTML = '<div class="step-header">' +
    '<span class="step-drag-handle" draggable="true" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span>' +
    '<span class="step-number">Step ' + (idx + 1) + '</span>' +
    '<div class="step-actions"><button type="button" class="btn btn-move-up">↑</button><button type="button" class="btn btn-move-down">↓</button><button type="button" class="btn btn-remove-step">Remove</button></div></div>' +
    '<div><label>ID</label><input type="text" class="input step-id" value="' + esc(step.id) + '" placeholder="step' + (idx + 1) + '" /></div>' +
    '<div><label>Type</label><select class="input step-type">' +
    '<option value="instruction"' + (type === 'instruction' ? ' selected' : '') + '>instruction</option>' +
    '<option value="quiz"' + (type === 'quiz' ? ' selected' : '') + '>quiz</option>' +
    '<option value="hardware_trigger"' + (type === 'hardware_trigger' ? ' selected' : '') + '>hardware_trigger</option>' +
    '<option value="fill_blank"' + (type === 'fill_blank' ? ' selected' : '') + '>fill_blank</option>' +
    '<option value="matching"' + (type === 'matching' ? ' selected' : '') + '>matching</option>' +
    '<option value="ordering"' + (type === 'ordering' ? ' selected' : '') + '>ordering</option>' +
    '<option value="svg"' + (type === 'svg' ? ' selected' : '') + '>svg</option>' +
    '<option value="completion"' + (type === 'completion' ? ' selected' : '') + '>completion</option></select></div>' +
    '<div><label>Content (Markdown)</label><textarea class="input step-content" rows="4">' + esc(step.content || '') + '</textarea></div>' +
    (optsHtml ? '<div class="step-extra">' + optsHtml + '</div>' : '');
  container.appendChild(card);

  card.querySelector('.btn-remove-step')?.addEventListener('click', function () {
    card.remove();
    refreshStepNumbers(container);
  });
  card.querySelector('.btn-move-up')?.addEventListener('click', function () {
    if (card.previousElementSibling) {
      container.insertBefore(card, card.previousElementSibling);
      refreshStepNumbers(container);
    }
  });
  card.querySelector('.btn-move-down')?.addEventListener('click', function () {
    if (card.nextElementSibling) {
      container.insertBefore(card.nextElementSibling, card);
      refreshStepNumbers(container);
    }
  });

  wireStepDragDrop(container, card, idx);
  if (type === 'svg') wireSvgConfigureButton(card);

  card.querySelector('.step-type')?.addEventListener('change', function () {
    var newType = this.value;
    var extra = card.querySelector('.step-extra');
    extra?.remove();
    var div = document.createElement('div');
    div.className = 'step-extra';
    if (newType === 'quiz') {
      div.innerHTML = '<div class="quiz-opt-row"><input type="text" class="input quiz-option" value="Option A" /><button type="button" class="btn btn-remove-opt">−</button></div><div class="quiz-opt-row"><input type="text" class="input quiz-option" value="Option B" /><button type="button" class="btn btn-remove-opt">−</button></div><div><label>Correct index</label><input type="number" class="input quiz-correct" min="0" value="0" /></div>';
    } else if (newType === 'hardware_trigger') {
      div.innerHTML = '<div><label>Sensor</label><select class="input step-sensor">' + buildSensorOptionsHtml('accel.total') + '</select></div><div><label>Threshold (e.g. freefall &gt; 0.3s)</label><input type="text" class="input step-threshold" value="freefall > 0.3s" /><span class="threshold-error hint" style="display:none;color:#c00;"></span></div>';
    } else if (newType === 'fill_blank') {
      div.innerHTML = '<p class="hint">Use ___ in content for each blank.</p><div class="fill-blank-row"><input type="text" class="input blank-answer" placeholder="Correct answer" /><input type="text" class="input blank-accept" placeholder="Alternatives (comma)" /><button type="button" class="btn btn-remove-blank">−</button></div><button type="button" class="btn btn-add-blank">+ Add blank</button>';
    } else if (newType === 'matching') {
      div.innerHTML = '<div class="matching-pair-row"><input type="text" class="input pair-left" placeholder="Left" /><input type="text" class="input pair-right" placeholder="Right" /><button type="button" class="btn btn-remove-pair">−</button></div><div class="matching-pair-row"><input type="text" class="input pair-left" placeholder="Left" /><input type="text" class="input pair-right" placeholder="Right" /><button type="button" class="btn btn-remove-pair">−</button></div><button type="button" class="btn btn-add-pair">+ Add pair</button>';
    } else if (newType === 'ordering') {
      div.innerHTML = '<p class="hint">Items in correct order.</p><div class="ordering-row"><input type="text" class="input ordering-item" placeholder="Item 1" /><button type="button" class="btn btn-remove-ordering">−</button></div><div class="ordering-row"><input type="text" class="input ordering-item" placeholder="Item 2" /><button type="button" class="btn btn-remove-ordering">−</button></div><div class="ordering-row"><input type="text" class="input ordering-item" placeholder="Item 3" /><button type="button" class="btn btn-remove-ordering">−</button></div><button type="button" class="btn btn-add-ordering">+ Add item</button>';
    } else if (newType === 'svg') {
      div.innerHTML = '<div class="step-svg-config"><input type="hidden" class="input step-svg-spec" value=""/>' +
        '<span class="step-svg-summary">No SVG selected</span> <button type="button" class="btn btn-configure-svg">Configure SVG</button></div>';
    }
    if (div.innerHTML) card.appendChild(div);
    if (newType === 'svg') wireSvgConfigureButton(card);
    wireStepExtraButtons(card);
  });

  wireStepExtraButtons(card);
}

function wireSvgConfigureButton(card) {
  var btn = card.querySelector('.btn-configure-svg');
  if (!btn || btn._svgWired) return;
  btn._svgWired = true;
  btn.addEventListener('click', function () {
    var specEl = card.querySelector('.step-svg-spec');
    var summaryEl = card.querySelector('.step-svg-summary');
    var initial = {};
    if (specEl && specEl.value) {
      try { initial = JSON.parse(specEl.value); } catch (e) {}
    }
    openSVGFactoryWizard(function (svgSpec) {
      if (specEl) specEl.value = JSON.stringify(svgSpec);
      if (summaryEl) {
        var t = svgSpec.factory || 'SVG';
        if (svgSpec.opts && (svgSpec.opts.w || svgSpec.opts.h)) t += ' ' + (svgSpec.opts.w || 420) + '×' + (svgSpec.opts.h || 280);
        summaryEl.textContent = t;
      }
    });
  });
}

function wireStepExtraButtons(card) {
  card.querySelector('.btn-add-blank')?.addEventListener('click', function () {
    var wrap = this.previousElementSibling?.parentElement || this.parentElement;
    var row = document.createElement('div');
    row.className = 'fill-blank-row';
    row.innerHTML = '<input type="text" class="input blank-answer" placeholder="Correct answer" /><input type="text" class="input blank-accept" placeholder="Alternatives (comma)" /><button type="button" class="btn btn-remove-blank">−</button>';
    this.parentElement.insertBefore(row, this);
    row.querySelector('.btn-remove-blank').addEventListener('click', function () { row.remove(); });
  });
  card.querySelectorAll('.btn-remove-blank').forEach(function (btn) {
    if (!btn._wired) { btn._wired = true; btn.addEventListener('click', function () { btn.closest('.fill-blank-row')?.remove(); }); }
  });
  card.querySelector('.btn-add-pair')?.addEventListener('click', function () {
    var row = document.createElement('div');
    row.className = 'matching-pair-row';
    row.innerHTML = '<input type="text" class="input pair-left" placeholder="Left" /><input type="text" class="input pair-right" placeholder="Right" /><button type="button" class="btn btn-remove-pair">−</button>';
    this.parentElement.insertBefore(row, this);
    row.querySelector('.btn-remove-pair').addEventListener('click', function () { row.remove(); });
  });
  card.querySelectorAll('.btn-remove-pair').forEach(function (btn) {
    if (!btn._wired) { btn._wired = true; btn.addEventListener('click', function () { btn.closest('.matching-pair-row')?.remove(); }); }
  });
  card.querySelector('.btn-add-ordering')?.addEventListener('click', function () {
    var row = document.createElement('div');
    row.className = 'ordering-row';
    row.innerHTML = '<input type="text" class="input ordering-item" placeholder="Item" /><button type="button" class="btn btn-remove-ordering">−</button>';
    this.parentElement.insertBefore(row, this);
    row.querySelector('.btn-remove-ordering').addEventListener('click', function () { row.remove(); });
  });
  card.querySelectorAll('.btn-remove-ordering').forEach(function (btn) {
    if (!btn._wired) { btn._wired = true; btn.addEventListener('click', function () { btn.closest('.ordering-row')?.remove(); }); }
  });

  var thresholdInp = card.querySelector('.step-threshold');
  if (thresholdInp && !thresholdInp._blurWired) {
    thresholdInp._blurWired = true;
    thresholdInp.addEventListener('blur', function () {
      var ctx = authorEditorContext;
      if (!ctx || !ctx.api || !ctx.main) return;
      var errEl = card.querySelector('.threshold-error');
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      var lesson = collectLessonFromForm(ctx.main);
      ctx.api.postAuthorValidate(lesson).then(function (r) {
        var stepIdx = parseInt(card.dataset.idx, 10);
        var stepLabel = 'step ' + (stepIdx + 1);
        var stepErrors = (r.errors || []).filter(function (e) { return e.indexOf(stepLabel) !== -1 && e.indexOf('threshold') !== -1; });
        if (stepErrors.length && errEl) {
          errEl.textContent = stepErrors[0];
          errEl.style.display = 'block';
        }
      }).catch(function () {});
    });
  }
}

export { renderLessonCreationWizard };

export function renderAuthorNew(main, slug) {
  const token = getStoredToken();
  if (!token) {
    main.innerHTML = '<p>Please <a href="#/author/login">Log in</a> first.</p>';
    navigateTo('#/author/login');
    return;
  }

  var baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = '<div class="top-page card"><p>Set the Hub URL in <a href="#/settings">Settings</a> before authoring.</p><p><a href="#/author">← Back</a></p></div>';
    return;
  }

  var api = createHubApi(baseUrl);
  var statusEl = null;
  var lesson = defaultLesson();

  function setStatus(msg, isError) {
    if (statusEl) {
      statusEl.textContent = msg || '';
      statusEl.className = isError ? 'error-box' : 'success-box';
    }
  }

  main.innerHTML = '<div class="top-page">' +
    '<h1>' + (slug ? 'Edit Lesson' : 'New Lesson') + '</h1>' +
    '<div id="editor-status" class="card" style="margin-bottom:1rem;display:none;"></div>' +
    '<form id="lesson-form">' +
    '<section class="card"><h2>Meta</h2>' +
    '<div><label for="meta-identifier">Identifier</label><input type="text" id="meta-identifier" class="input" placeholder="ols:domain:topic_v1" /></div>' +
    '<div><label for="meta-title">Title</label><input type="text" id="meta-title" class="input" required placeholder="Lesson title" /></div>' +
    '<div><label for="meta-description">Description</label><textarea id="meta-description" class="input" rows="2" placeholder="Brief description"></textarea></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">' +
    '<div><label for="meta-language">Language</label><input type="text" id="meta-language" class="input" value="en" placeholder="en" /></div>' +
    '<div><label for="meta-license">License</label><input type="text" id="meta-license" class="input" value="CC-BY-SA-4.0" /></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">' +
    '<div><label for="meta-created">Created (ISO)</label><input type="datetime-local" id="meta-created" class="input" /></div>' +
    '<div><label for="meta-difficulty">Difficulty (1–5)</label><input type="number" id="meta-difficulty" class="input" min="1" max="5" value="1" /></div>' +
    '<div><label for="meta-time">Time (e.g. PT5M)</label><input type="text" id="meta-time" class="input" value="PT5M" placeholder="PT5M" /></div>' +
    '</div>' +
    '<div><label for="meta-tags">Tags (comma-separated)</label><input type="text" id="meta-tags" class="input" placeholder="beginner, tutorial" /></div>' +
    '<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #ddd;"><h4 style="margin:0 0 0.5rem 0;">UTU (optional)</h4>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">' +
    '<div><label for="meta-utu-spine">Spine</label><select id="meta-utu-spine" class="input"><option value="">— None —</option>' +
    ['MAC-1','MAC-2','MAC-3','MAC-4','MAC-5','MAC-6','MAC-7','MAC-8','SCI-1','SCI-2','SCI-3','SCI-4','SCI-5','SCI-6','SCI-7','SOC-1','SOC-2','SOC-3','SOC-4','SOC-5','SOC-6','SOC-7'].map(function(id){return '<option value="'+esc(id)+'">'+esc(id)+'</option>';}).join('') +
    '</select></div>' +
    '<div><label for="meta-utu-band">Band (1–6)</label><select id="meta-utu-band" class="input"><option value="">— None —</option><option value="1">B1</option><option value="2">B2</option><option value="3">B3</option><option value="4">B4</option><option value="5">B5</option><option value="6">B6</option></select></div>' +
    '<div><label for="meta-utu-protocol">Protocol (1–5)</label><select id="meta-utu-protocol" class="input"><option value="">— None —</option><option value="1">P1 Transmission</option><option value="2">P2 Guided Construction</option><option value="3">P3 Apprenticeship</option><option value="4">P4 Dev. Sequencing</option><option value="5">P5 Meaning Activation</option></select></div>' +
    '</div></div>' +
    '</section>' +
    '<section class="card"><h2>Steps</h2><div id="steps-container"></div><div class="editor-actions" style="margin-top:0.5rem;"><button type="button" id="btn-add-step" class="btn btn-primary">+ Add Step</button> <button type="button" id="btn-add-sensor-toy" class="btn">Create sensor toy</button></div></section>' +
    '<section class="card"><h2>Ontology (optional)</h2>' +
    '<div><label for="ontology-requires">Requires (skill IDs, comma)</label><input type="text" id="ontology-requires" class="input" placeholder="skill:a, skill:b" /></div>' +
    '<div><label for="ontology-provides">Provides (skill IDs, comma)</label><input type="text" id="ontology-provides" class="input" placeholder="skill:x" /></div>' +
    '</section>' +
    '<section class="card"><h2>Gate (optional)</h2>' +
    '<div><label for="gate-enabled">Enable gate</label><input type="checkbox" id="gate-enabled" /></div>' +
    '<div id="gate-fields" style="display:none;margin-top:1rem;">' +
    '<div><label for="gate-type">Type</label><select id="gate-type" class="input"><option value="quiz">quiz</option><option value="manual_verification">manual_verification</option></select></div>' +
    '<div><label for="gate-skill-target">Skill target</label><input type="text" id="gate-skill-target" class="input" placeholder="skill:id" /></div>' +
    '<div><label for="gate-question">Question</label><input type="text" id="gate-question" class="input" placeholder="What is the prerequisite?" /></div>' +
    '<div><label for="gate-expected-answer">Expected answer</label><input type="text" id="gate-expected-answer" class="input" placeholder="Correct answer text" /></div>' +
    '<div><label for="gate-on-fail">On fail</label><input type="text" id="gate-on-fail" class="input" placeholder="skip_to:step_id or message" /></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">' +
    '<div><label for="gate-passing-score">Passing score (0–1)</label><input type="number" id="gate-passing-score" class="input" min="0" max="1" step="0.1" placeholder="1" /></div>' +
    '<div><label for="gate-retry-delay">Retry delay (e.g. PT30S)</label><input type="text" id="gate-retry-delay" class="input" placeholder="PT30S" /></div>' +
    '</div></div></section>' +
    '<div class="editor-actions">' +
    '<button type="button" id="btn-validate" class="btn">Validate</button>' +
    '<button type="button" id="btn-preview" class="btn">Preview</button>' +
    '<button type="button" id="btn-save" class="btn btn-primary">Save</button>' +
    '<a href="#/author" class="btn">Cancel</a>' +
    '</div>' +
    '</form>' +
    '<section id="preview-pane" class="card" style="margin-top:1.5rem;display:none;">' +
    '<h3 style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">' +
    '<span>Live Preview</span>' +
    '<button type="button" id="btn-hide-preview" class="btn" style="font-size:0.85rem;">Hide</button>' +
    '</h3>' +
    '<iframe id="preview-iframe" title="Lesson preview" style="width:100%;min-height:400px;border:1px solid #ccc;border-radius:4px;background:#fff;"></iframe>' +
    '</section>' +
    '<p style="margin-top:1rem;"><a href="#/author">← Back to Author</a></p>' +
    '</div>';

  authorEditorContext = { main: main, api: api };
  statusEl = main.querySelector('#editor-status');
  var container = main.querySelector('#steps-container');
  api.getAuthorSensors().then(function (r) {
    authorSensorCache = r.sensors || [];
  }).catch(function () {});
  var createdInput = main.querySelector('#meta-created');
  if (createdInput) {
    var now = new Date();
    createdInput.value = now.toISOString().slice(0, 16);
  }

  function loadAndPopulate() {
    if (!slug) {
      var draft = consumeWizardDraft();
      if (draft) {
        lesson = draft;
        statusEl.style.display = 'block';
        if (statusEl) { statusEl.textContent = 'Lesson created by wizard. Review and save.'; statusEl.className = 'success-box'; }
      }
      populateFormFromLesson(main, lesson);
      return;
    }
    api.getAuthorLesson(slug).then(function (data) {
      lesson = data.lessonData || data.lesson || data;
      populateFormFromLesson(main, lesson);
    }).catch(function (err) {
      setStatus('Load failed: ' + (err.message || 'Unknown error'), true);
      statusEl.style.display = 'block';
      populateFormFromLesson(main, defaultLesson());
    });
  }

  loadAndPopulate();

  main.querySelector('#gate-enabled')?.addEventListener('change', function () {
    var gf = main.querySelector('#gate-fields');
    if (gf) gf.style.display = this.checked ? 'block' : 'none';
  });

  main.querySelector('#btn-add-step').addEventListener('click', function () {
    var count = container.querySelectorAll('.step-card').length;
    appendStepCard(container, { id: 'step' + (count + 1), type: 'instruction', content: '' }, count);
  });

  main.querySelector('#btn-add-sensor-toy')?.addEventListener('click', function () {
    openSensorToyWizard(function (toy) {
      var count = container.querySelectorAll('.step-card').length;
      if (toy.threshold) {
        appendStepCard(container, {
          id: 'step' + (count + 1),
          type: 'hardware_trigger',
          content: toy.name ? 'Trigger: ' + toy.name : '',
          sensor: toy.sensorId,
          threshold: toy.threshold
        }, count);
        count++;
      }
      if (toy.svgSpec) {
        appendStepCard(container, {
          id: 'step' + (count + 1),
          type: 'svg',
          content: '',
          svg_spec: toy.svgSpec
        }, count);
      }
      if (!toy.threshold && !toy.svgSpec) {
        appendStepCard(container, {
          id: 'step' + (count + 1),
          type: 'hardware_trigger',
          content: toy.name ? toy.name : '',
          sensor: toy.sensorId,
          threshold: 'accel.total > 2'
        }, count);
      }
    });
  });

  wireStepsContainerDragDrop(container);

  main.querySelector('#btn-validate').addEventListener('click', function () {
    statusEl.style.display = 'block';
    setStatus('Validating…', false);
    var formData = collectLessonFromForm(main);
    var payload = slug && lesson ? mergeLessonForRoundTrip(lesson, formData) : formData;
    api.postAuthorValidate(payload).then(function (r) {
      if (r.valid) {
        setStatus('Valid. ' + (r.warnings && r.warnings.length ? 'Warnings: ' + r.warnings.join('; ') : ''), false);
      } else {
        setStatus('Invalid: ' + (r.errors && r.errors.join('; ')), true);
      }
    }).catch(function (err) {
      setStatus('Validation error: ' + (err.message || 'Unknown'), true);
    });
  });

  var previewPane = main.querySelector('#preview-pane');
  var previewIframe = main.querySelector('#preview-iframe');
  main.querySelector('#btn-preview').addEventListener('click', function () {
    statusEl.style.display = 'block';
    setStatus('Building preview…', false);
    var formData = collectLessonFromForm(main);
    var payload = slug && lesson ? mergeLessonForRoundTrip(lesson, formData) : formData;
    api.postAuthorPreview(payload).then(function (r) {
      if (r.error) {
        setStatus('Preview failed: ' + r.error, true);
        if (previewPane) previewPane.style.display = 'none';
      } else {
        var stepCount = (r.ir && r.ir.steps && r.ir.steps.length) || 0;
        setStatus('Preview OK. ' + stepCount + ' step(s).', false);
        if (r.html && previewIframe && previewPane) {
          previewIframe.srcdoc = r.html;
          previewPane.style.display = 'block';
        }
      }
    }).catch(function (err) {
      setStatus('Preview error: ' + (err.message || 'Unknown'), true);
      if (previewPane) previewPane.style.display = 'none';
    });
  });
  main.querySelector('#btn-hide-preview')?.addEventListener('click', function () {
    if (previewPane) previewPane.style.display = 'none';
  });

  function doSave() {
    statusEl.style.display = 'block';
    setStatus('Validating…', false);
    var formData = collectLessonFromForm(main);
    var payload = slug && lesson ? mergeLessonForRoundTrip(lesson, formData) : formData;
    api.postAuthorValidate(payload).then(function (vr) {
      if (!vr.valid) {
        setStatus('Cannot save — invalid: ' + (vr.errors && vr.errors.join('; ')), true);
        return;
      }
      setStatus('Saving…', false);
      api.postAuthorSave(payload, { compile: true }).then(function (r) {
        if (r.error) {
          setStatus('Save failed: ' + r.error, true);
        } else {
          var msg = 'Saved as ' + (r.slug || 'lesson') + '. Path: ' + (r.path || '');
          if (vr.warnings && vr.warnings.length) msg += ' (warnings: ' + vr.warnings.join('; ') + ')';
          setStatus(msg, false);
          if (r.slug && !slug) {
            setTimeout(function () { navigateTo('#/author/' + r.slug + '/edit'); }, 1500);
          }
        }
      }).catch(function (err) {
        setStatus('Save error: ' + (err.message || 'Unknown'), true);
      });
    }).catch(function (err) {
      setStatus('Validation error: ' + (err.message || 'Unknown'), true);
    });
  }

  main.querySelector('#btn-save').addEventListener('click', doSave);

  var formEl = main.querySelector('form');
  if (formEl) {
    formEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        doSave();
      }
    });
  }
}
