/**
 * Lesson Author — form-based editor (R7: The Editor).
 * Vanilla JS, uses author API: load, validate, preview, save.
 */
import { getHubUrl, createHubApi } from '../api.js';
import { restoreCreatorSession, setCreatorSession, clearCreatorSession, getStoredToken } from '../auth.js';
import { navigateTo } from '../router.js';

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
      <a href="#/author/new" class="btn btn-primary">Create New Lesson</a>
      <div class="card" style="margin-top: 1rem;">
        <h3 style="margin-bottom: 0.5rem;">Edit existing</h3>
        <p class="hint" style="margin-bottom: 0.5rem;">Enter the lesson slug (e.g. hello-world, gravity) to edit.</p>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="text" id="edit-slug" class="input" placeholder="hello-world" style="max-width: 200px;" />
          <button type="button" id="btn-edit" class="btn">Edit</button>
        </div>
      </div>
      <p style="margin-top: 1.5rem;"><a href="#/author/login">Account / Log out</a></p>
    </div>
  `;
  main.querySelector('#btn-edit').addEventListener('click', function () {
    var slug = (main.querySelector('#edit-slug').value || '').trim().replace(/\.yaml$/, '');
    if (slug) navigateTo('#/author/' + encodeURIComponent(slug) + '/edit');
  });
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
    gate: null
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
      step.sensor = (card.querySelector('.step-sensor')?.value || 'accelerometer').trim();
      step.threshold = (card.querySelector('.step-threshold')?.value || 'freefall > 0.3s').trim();
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

  return {
    version: '1.8.0',
    meta: meta,
    steps: steps,
    ontology: (ontology.requires && ontology.requires.length) || (ontology.provides && ontology.provides.length) ? ontology : undefined,
    gate: null
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

  var onEl = main.querySelector('#ontology-requires');
  var opEl = main.querySelector('#ontology-provides');
  if (onEl && lesson.ontology && lesson.ontology.requires && lesson.ontology.requires.length) {
    onEl.value = lesson.ontology.requires.map(function (r) { return r.skill || r; }).join(', ');
  }
  if (opEl && lesson.ontology && lesson.ontology.provides && lesson.ontology.provides.length) {
    opEl.value = lesson.ontology.provides.map(function (p) { return p.skill || p; }).join(', ');
  }

  var container = main.querySelector('#steps-container');
  if (!container) return;
  container.innerHTML = '';
  (lesson.steps || []).forEach(function (step, i) {
    appendStepCard(container, step, i);
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
    optsHtml = '<div><label>Sensor</label><select class="input step-sensor"><option value="accelerometer"' + (step.sensor === 'accelerometer' ? ' selected' : '') + '>accelerometer</option><option value="gyroscope"' + (step.sensor === 'gyroscope' ? ' selected' : '') + '>gyroscope</option></select></div>';
    optsHtml += '<div><label>Threshold (e.g. freefall &gt; 0.3s)</label><input type="text" class="input step-threshold" value="' + esc(step.threshold || 'freefall > 0.3s') + '" placeholder="freefall > 0.3s" /></div>';
  }

  card.innerHTML = '<div class="step-header"><span>Step ' + (idx + 1) + '</span><div class="step-actions"><button type="button" class="btn btn-move-up">↑</button><button type="button" class="btn btn-move-down">↓</button><button type="button" class="btn btn-remove-step">Remove</button></div></div>' +
    '<div><label>ID</label><input type="text" class="input step-id" value="' + esc(step.id) + '" placeholder="step' + (idx + 1) + '" /></div>' +
    '<div><label>Type</label><select class="input step-type"><option value="instruction"' + (type === 'instruction' ? ' selected' : '') + '>instruction</option><option value="quiz"' + (type === 'quiz' ? ' selected' : '') + '>quiz</option><option value="hardware_trigger"' + (type === 'hardware_trigger' ? ' selected' : '') + '>hardware_trigger</option><option value="completion"' + (type === 'completion' ? ' selected' : '') + '>completion</option></select></div>' +
    '<div><label>Content (Markdown)</label><textarea class="input step-content" rows="4">' + esc(step.content || '') + '</textarea></div>' +
    (optsHtml ? '<div class="step-extra">' + optsHtml + '</div>' : '');
  container.appendChild(card);

  card.querySelector('.btn-remove-step')?.addEventListener('click', function () {
    card.remove();
  });
  card.querySelector('.btn-move-up')?.addEventListener('click', function () {
    if (card.previousElementSibling) container.insertBefore(card, card.previousElementSibling);
  });
  card.querySelector('.btn-move-down')?.addEventListener('click', function () {
    if (card.nextElementSibling) container.insertBefore(card.nextElementSibling, card);
  });

  card.querySelector('.step-type')?.addEventListener('change', function () {
    var newType = this.value;
    var extra = card.querySelector('.step-extra');
    if (newType === 'quiz' && (!extra || !extra.querySelector('.quiz-option'))) {
      var q = { type: 'quiz', answer_options: ['Option A', 'Option B'], correct_index: 0 };
      card.querySelector('.step-extra')?.remove();
      var div = document.createElement('div');
      div.className = 'step-extra';
      div.innerHTML = '<div class="quiz-opt-row"><input type="text" class="input quiz-option" value="Option A" /><button type="button" class="btn btn-remove-opt">−</button></div><div class="quiz-opt-row"><input type="text" class="input quiz-option" value="Option B" /><button type="button" class="btn btn-remove-opt">−</button></div><div><label>Correct index</label><input type="number" class="input quiz-correct" min="0" value="0" /></div>';
      card.appendChild(div);
    } else if (newType === 'hardware_trigger' && (!extra || !extra.querySelector('.step-threshold'))) {
      card.querySelector('.step-extra')?.remove();
      var d = document.createElement('div');
      d.className = 'step-extra';
      d.innerHTML = '<div><label>Sensor</label><select class="input step-sensor"><option value="accelerometer">accelerometer</option><option value="gyroscope">gyroscope</option></select></div><div><label>Threshold</label><input type="text" class="input step-threshold" value="freefall > 0.3s" /></div>';
      card.appendChild(d);
    } else if ((newType === 'instruction' || newType === 'completion') && extra) {
      extra.remove();
    }
  });
}

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
    '</section>' +
    '<section class="card"><h2>Steps</h2><div id="steps-container"></div><button type="button" id="btn-add-step" class="btn btn-primary">+ Add Step</button></section>' +
    '<section class="card"><h2>Ontology (optional)</h2>' +
    '<div><label for="ontology-requires">Requires (skill IDs, comma)</label><input type="text" id="ontology-requires" class="input" placeholder="skill:a, skill:b" /></div>' +
    '<div><label for="ontology-provides">Provides (skill IDs, comma)</label><input type="text" id="ontology-provides" class="input" placeholder="skill:x" /></div>' +
    '</section>' +
    '<div class="editor-actions">' +
    '<button type="button" id="btn-validate" class="btn">Validate</button>' +
    '<button type="button" id="btn-preview" class="btn">Preview</button>' +
    '<button type="button" id="btn-save" class="btn btn-primary">Save</button>' +
    '<a href="#/author" class="btn">Cancel</a>' +
    '</div>' +
    '</form>' +
    '<p style="margin-top:1rem;"><a href="#/author">← Back to Author</a></p>' +
    '</div>';

  statusEl = main.querySelector('#editor-status');
  var container = main.querySelector('#steps-container');
  var createdInput = main.querySelector('#meta-created');
  if (createdInput) {
    var now = new Date();
    createdInput.value = now.toISOString().slice(0, 16);
  }

  function loadAndPopulate() {
    if (!slug) {
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

  main.querySelector('#btn-add-step').addEventListener('click', function () {
    var count = container.querySelectorAll('.step-card').length;
    appendStepCard(container, { id: 'step' + (count + 1), type: 'instruction', content: '' }, count);
  });

  main.querySelector('#btn-validate').addEventListener('click', function () {
    statusEl.style.display = 'block';
    setStatus('Validating…', false);
    var payload = collectLessonFromForm(main);
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

  main.querySelector('#btn-preview').addEventListener('click', function () {
    statusEl.style.display = 'block';
    setStatus('Building preview…', false);
    var payload = collectLessonFromForm(main);
    api.postAuthorPreview(payload).then(function (r) {
      if (r.error) {
        setStatus('Preview failed: ' + r.error, true);
      } else {
        setStatus('Preview OK. IR has ' + (r.ir?.steps?.length || 0) + ' steps. Open compiled HTML in hub to view.', false);
      }
    }).catch(function (err) {
      setStatus('Preview error: ' + (err.message || 'Unknown'), true);
    });
  });

  main.querySelector('#btn-save').addEventListener('click', function () {
    statusEl.style.display = 'block';
    setStatus('Saving…', false);
    var payload = collectLessonFromForm(main);
    api.postAuthorSave(payload, { compile: true }).then(function (r) {
      if (r.error) {
        setStatus('Save failed: ' + r.error, true);
      } else {
        setStatus('Saved as ' + (r.slug || 'lesson') + '. Path: ' + (r.path || ''), false);
        if (r.slug && !slug) {
          setTimeout(function () { navigateTo('#/author/' + r.slug + '/edit'); }, 1500);
        }
      }
    }).catch(function (err) {
      setStatus('Save error: ' + (err.message || 'Unknown'), true);
    });
  });
}
