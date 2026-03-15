/**
 * Lesson Creation Wizard — step-by-step flow to discover an archetype and populate a lesson
 * with the right text, graphics, and images. Vanilla JS.
 *
 * Route: #/author/wizard
 * On completion: writes lesson to sessionStorage and redirects to #/author/new for final save.
 */

import { getHubUrl, createHubApi } from '../api.js';
import { getStoredToken } from '../auth.js';
import { navigateTo } from '../router.js';
import { openSVGFactoryWizard } from './svg-factory-wizard.js';

const WIZARD_DRAFT_KEY = 'lessonCreationWizard_draft';

const PROTOCOLS = [
  { id: 1, label: 'Watch & remember', short: 'P1 Transmission', description: 'Present information; learner absorbs and recalls.' },
  { id: 2, label: 'Discover by doing', short: 'P2 Guided construction', description: 'Learner explores with guidance; builds understanding.' },
  { id: 3, label: 'Practice with feedback', short: 'P3 Apprenticeship', description: 'Repeated practice with clear success criteria.' },
  { id: 4, label: 'Vary & connect', short: 'P4 Developmental sequencing', description: 'Same concept in different contexts; connect ideas.' },
  { id: 5, label: 'Apply in context', short: 'P5 Meaning activation', description: 'Use skills in real-world or narrative context.' }
];

const BAND_RANGES = [
  { min: 1, max: 2, label: 'Early (B1–B2)', description: 'Concrete, sensory, introductory.' },
  { min: 3, max: 4, label: 'Middle (B3–B4)', description: 'Procedural and structural understanding.' },
  { min: 5, max: 6, label: 'Advanced (B5–B6)', description: 'Formal reasoning and transfer.' }
];

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function parseStepPattern(pattern) {
  if (!pattern || !Array.isArray(pattern)) return [];
  return pattern.map(function (p) {
    const parts = String(p).split('|');
    return { type: parts[0].trim(), alt: parts[1] ? parts[1].trim() : null };
  });
}

export function renderLessonCreationWizard(main) {
  if (!getStoredToken()) {
    main.innerHTML = '<div class="top-page card"><p>Please <a href="#/author/login">log in</a> to use the lesson wizard.</p><p><a href="#/author">← Back to Author</a></p></div>';
    return;
  }

  const baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = '<div class="top-page card"><p>Set the <a href="#/settings">Hub URL</a> in Settings to use the lesson wizard.</p><p><a href="#/author">← Back to Author</a></p></div>';
    return;
  }

  const api = createHubApi(baseUrl);
  let step = 0;
  let state = {
    topic: '',
    protocol: null,
    bandRange: null,
    archetypes: [],
    selectedArchetype: null,
    stepContents: [],
    title: '',
    description: ''
  };

  function goNext() { step++; render(); }
  function goBack() { step--; render(); }

  function render() {
    if (step === 0) renderStep0();
    else if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else if (step === 3) renderStep3();
    else if (step === 4) renderStep4();
    else if (step === 5) renderStep5();
    else if (step === 6) renderStep6();
    else if (step === 7) renderStep7();
  }

  function renderStep0() {
    main.innerHTML = '<div class="top-page">' +
      '<h1>Create a lesson</h1>' +
      '<p class="tagline">Start from scratch or fork an existing lesson.</p>' +
      '<div class="wizard-factory-grid" style="grid-template-columns: 1fr 1fr;">' +
      '<button type="button" class="lesson-wizard-card" id="wizard-start-scratch">' +
      '<h3>Start from scratch</h3>' +
      '<p>Pick an archetype and build your lesson step by step with the wizard.</p></button>' +
      '<a href="#/author/browse?fork=1" class="lesson-wizard-card" style="text-align:left;text-decoration:none;color:inherit;">' +
      '<h3>Fork a lesson</h3>' +
      '<p>Browse lessons, SVGs, and sensor toys. Fork one to use as a starting point.</p></a>' +
      '</div>' +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<a href="#/author" class="btn">Cancel</a>' +
      '</div></div>';
    main.querySelector('#wizard-start-scratch').addEventListener('click', function () { step = 1; render(); });
  }

  function renderStep1() {
    main.innerHTML = '<div class="top-page">' +
      '<h1>Create a lesson</h1>' +
      '<p class="tagline">We\'ll help you pick a lesson type and fill in the content step by step.</p>' +
      '<div class="card">' +
      '<h2>What’s the topic or skill?</h2>' +
      '<p class="hint">e.g. "Introduction to fractions", "Newton\'s first law", "Writing a short paragraph"</p>' +
      '<input type="text" id="wizard-topic" class="input" placeholder="Topic or skill" value="' + escapeHtml(state.topic) + '" style="max-width: 400px;" />' +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<button type="button" class="btn" id="wizard-back-1">← Back</button>' +
      '<a href="#/author" class="btn">Cancel</a>' +
      '<button type="button" class="btn btn-primary" id="wizard-next-1">Next →</button>' +
      '</div></div></div>';
    main.querySelector('#wizard-topic').addEventListener('input', function () { state.topic = this.value.trim(); });
    main.querySelector('#wizard-back-1').addEventListener('click', function () { step = 0; render(); });
    main.querySelector('#wizard-next-1').addEventListener('click', function () { state.topic = main.querySelector('#wizard-topic').value.trim(); goNext(); });
  }

  function renderStep2() {
    let cards = PROTOCOLS.map(function (p) {
      const sel = state.protocol === p.id ? ' selected' : '';
      return '<button type="button" class="lesson-wizard-card' + sel + '" data-protocol="' + p.id + '">' +
        '<h3>' + escapeHtml(p.label) + '</h3>' +
        '<p>' + escapeHtml(p.description) + '</p>' +
        '<span class="hint">' + escapeHtml(p.short) + '</span></button>';
    }).join('');
    main.innerHTML = '<div class="top-page">' +
      '<h1>How do learners engage?</h1>' +
      '<p class="tagline">Choose the style that best fits your topic.</p>' +
      '<p class="lesson-wizard-progress">Step 2 of 7</p>' +
      '<div class="card">' +
      '<div class="wizard-factory-grid" style="grid-template-columns: 1fr;">' + cards + '</div>' +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<button type="button" class="btn" id="wizard-back-2">← Back</button>' +
      '<button type="button" class="btn btn-primary" id="wizard-next-2">Next →</button>' +
      '</div></div></div>';
    main.querySelectorAll('.lesson-wizard-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.protocol = parseInt(btn.getAttribute('data-protocol'), 10);
        main.querySelectorAll('.lesson-wizard-card').forEach(function (c) { c.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
    main.querySelector('#wizard-back-2').addEventListener('click', goBack);
    main.querySelector('#wizard-next-2').addEventListener('click', function () {
      if (state.protocol == null) return;
      goNext();
    });
  }

  function renderStep3() {
    let cards = BAND_RANGES.map(function (b) {
      const key = b.min + '-' + b.max;
      const sel = state.bandRange && state.bandRange.min === b.min ? ' selected' : '';
      return '<button type="button" class="lesson-wizard-card' + sel + '" data-min="' + b.min + '" data-max="' + b.max + '">' +
        '<h3>' + escapeHtml(b.label) + '</h3>' +
        '<p>' + escapeHtml(b.description) + '</p></button>';
    }).join('');
    main.innerHTML = '<div class="top-page">' +
      '<h1>What level?</h1>' +
      '<p class="tagline">Rough band for your learners.</p>' +
      '<p class="lesson-wizard-progress">Step 3 of 7</p>' +
      '<div class="card">' +
      '<div class="wizard-factory-grid" style="grid-template-columns: 1fr;">' + cards + '</div>' +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<button type="button" class="btn" id="wizard-back-3">← Back</button>' +
      '<button type="button" class="btn btn-primary" id="wizard-next-3">Next →</button>' +
      '</div></div></div>';
    main.querySelectorAll('.lesson-wizard-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.bandRange = { min: parseInt(btn.getAttribute('data-min'), 10), max: parseInt(btn.getAttribute('data-max'), 10) };
        main.querySelectorAll('.lesson-wizard-card').forEach(function (c) { c.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
    main.querySelector('#wizard-back-3').addEventListener('click', goBack);
    main.querySelector('#wizard-next-3').addEventListener('click', function () {
      if (!state.bandRange) return;
      goNext();
    });
  }

  function renderStep4() {
    if (state.archetypes.length === 0) {
      const band = state.bandRange ? state.bandRange.min : null;
      api.getArchetypes({ band: band, protocol: state.protocol }).then(function (r) {
        state.archetypes = r.archetypes || [];
        renderStep4();
      }).catch(function () {
        state.archetypes = [];
        renderStep4();
      });
      main.innerHTML = '<div class="top-page"><div class="card"><p>Loading lesson types…</p></div></div>';
      return;
    }

    let cards = state.archetypes.slice(0, 12).map(function (a) {
      const sel = state.selectedArchetype && state.selectedArchetype.id === a.id ? ' selected' : '';
      return '<button type="button" class="lesson-wizard-card' + sel + '" data-id="' + escapeHtml(a.id) + '">' +
        '<h3>' + escapeHtml(a.name) + '</h3>' +
        '<p>' + escapeHtml(a.description) + '</p>' +
        (a.designHints && a.designHints.opening ? '<p class="hint" style="margin-top:0.5rem;">' + escapeHtml(a.designHints.opening.slice(0, 120)) + '…</p>' : '') +
        '</button>';
    }).join('');
    main.innerHTML = '<div class="top-page">' +
      '<h1>Choose a lesson type</h1>' +
      '<p class="tagline">These match your engagement style and level.</p>' +
      '<p class="lesson-wizard-progress">Step 4 of 7</p>' +
      '<div class="card">' +
      (state.archetypes.length === 0 ? '<p>No archetypes returned. Check hub connection or try different band/protocol.</p>' : '<div class="wizard-factory-grid" style="grid-template-columns: 1fr;">' + cards + '</div>') +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<button type="button" class="btn" id="wizard-back-4">← Back</button>' +
      '<button type="button" class="btn btn-primary" id="wizard-next-4">Next →</button>' +
      '</div></div></div>';

    main.querySelectorAll('.lesson-wizard-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-id');
        state.selectedArchetype = state.archetypes.find(function (a) { return a.id === id; }) || null;
        main.querySelectorAll('.lesson-wizard-card').forEach(function (c) { c.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
    main.querySelector('#wizard-back-4').addEventListener('click', goBack);
    main.querySelector('#wizard-next-4').addEventListener('click', function () {
      if (!state.selectedArchetype) return;
      state.stepContents = parseStepPattern(state.selectedArchetype.stepPattern).map(function () {
        return { content: '', svgSpec: null };
      });
      goNext();
    });
  }

  function renderStep5() {
    const a = state.selectedArchetype;
    const hints = a.designHints || {};
    const pattern = (a.stepPattern || []).join(' → ');
    main.innerHTML = '<div class="top-page">' +
      '<h1>Design guide</h1>' +
      '<p class="tagline">' + escapeHtml(a.name) + '</p>' +
      '<p class="lesson-wizard-progress">Step 5 of 7</p>' +
      '<div class="card">' +
      '<h3>Your lesson steps</h3>' +
      '<p class="hint">' + escapeHtml(pattern) + '</p>' +
      (hints.opening ? '<div class="step-slot" style="margin-top:1rem;"><strong>Opening</strong><p class="step-slot-hint">' + escapeHtml(hints.opening) + '</p></div>' : '') +
      (hints.assessment ? '<div class="step-slot"><strong>Assessment</strong><p class="step-slot-hint">' + escapeHtml(hints.assessment) + '</p></div>' : '') +
      (hints.visual ? '<div class="step-slot"><strong>Visuals</strong><p class="step-slot-hint">' + escapeHtml(hints.visual) + '</p></div>' : '') +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<button type="button" class="btn" id="wizard-back-5">← Back</button>' +
      '<button type="button" class="btn btn-primary" id="wizard-next-5">Next →</button>' +
      '</div></div></div>';
    main.querySelector('#wizard-back-5').addEventListener('click', goBack);
    main.querySelector('#wizard-next-5').addEventListener('click', goNext);
  }

  function renderStep6() {
    const pattern = parseStepPattern(state.selectedArchetype.stepPattern);
    const slots = pattern.map(function (p, i) {
      const slot = state.stepContents[i] || { content: '', svgSpec: null };
      const svgLabel = slot.svgSpec ? slot.svgSpec.factory + ' (' + (slot.svgSpec.opts && (slot.svgSpec.opts.w || slot.svgSpec.opts.h) ? (slot.svgSpec.opts.w || 420) + '×' + (slot.svgSpec.opts.h || 280) : '') + ')' : '';
      return '<div class="step-slot" data-idx="' + i + '">' +
        '<div class="step-slot-label">Step ' + (i + 1) + ': ' + escapeHtml(p.type) + (p.alt ? ' or ' + p.alt : '') + '</div>' +
        '<div class="step-slot-hint">Add the text (and optional graphic) for this step.</div>' +
        '<textarea class="input step-slot-content" rows="3" placeholder="Content (Markdown)">' + escapeHtml(slot.content) + '</textarea>' +
        (slot.svgSpec ? '<div><span class="svg-step-badge">SVG: ' + escapeHtml(svgLabel) + '</span> <button type="button" class="btn btn-sm btn-add-svg" data-idx="' + i + '">Change</button></div>' :
          '<button type="button" class="btn btn-sm btn-add-svg" data-idx="' + i + '">+ Add graphic (SVG)</button>') +
        '</div>';
    }).join('');
    main.innerHTML = '<div class="top-page">' +
      '<h1>Fill in each step</h1>' +
      '<p class="tagline">' + escapeHtml(state.selectedArchetype.name) + '</p>' +
      '<p class="lesson-wizard-progress">Step 6 of 7</p>' +
      '<div class="card">' + slots + '</div>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" id="wizard-back-6">← Back</button>' +
      '<button type="button" class="btn btn-primary" id="wizard-next-6">Next →</button>' +
      '</div></div>';

    main.querySelectorAll('.step-slot-content').forEach(function (ta, i) {
      ta.addEventListener('input', function () {
        if (!state.stepContents[i]) state.stepContents[i] = { content: '', svgSpec: null };
        state.stepContents[i].content = ta.value;
      });
    });
    main.querySelectorAll('.btn-add-svg').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        openSVGFactoryWizard(function (svgSpec) {
          if (!state.stepContents[idx]) state.stepContents[idx] = { content: '', svgSpec: null };
          state.stepContents[idx].svgSpec = svgSpec;
          renderStep6();
        });
      });
    });
    main.querySelector('#wizard-back-6').addEventListener('click', goBack);
    main.querySelector('#wizard-next-6').addEventListener('click', function () {
      main.querySelectorAll('.step-slot-content').forEach(function (ta, i) {
        if (!state.stepContents[i]) state.stepContents[i] = { content: '', svgSpec: null };
        state.stepContents[i].content = ta.value;
      });
      goNext();
    });
  }

  function renderStep7() {
    const a = state.selectedArchetype;
    const defaultTitle = state.topic || a.name;
    const defaultDesc = 'Lesson created with the Lesson Creation Wizard.';
    main.innerHTML = '<div class="top-page">' +
      '<h1>Almost done</h1>' +
      '<p class="tagline">Set title and description, then open in the editor to save.</p>' +
      '<p class="lesson-wizard-progress">Step 7 of 7</p>' +
      '<div class="card">' +
      '<div class="wizard-field"><label for="wizard-title">Lesson title</label><input type="text" id="wizard-title" class="input" value="' + escapeHtml(state.title || defaultTitle) + '" /></div>' +
      '<div class="wizard-field"><label for="wizard-desc">Description</label><textarea id="wizard-desc" class="input" rows="2">' + escapeHtml(state.description || defaultDesc) + '</textarea></div>' +
      '<div class="wizard-actions" style="margin-top: 1rem;">' +
      '<button type="button" class="btn" id="wizard-back-7">← Back</button>' +
      '<button type="button" class="btn btn-primary" id="wizard-create">Create lesson & open editor</button>' +
      '</div></div></div>';

    main.querySelector('#wizard-back-7').addEventListener('click', goBack);
    main.querySelector('#wizard-create').addEventListener('click', function () {
      const title = main.querySelector('#wizard-title').value.trim() || defaultTitle;
      const description = main.querySelector('#wizard-desc').value.trim() || defaultDesc;
      const pattern = parseStepPattern(a.stepPattern);
      const steps = [];
      pattern.forEach(function (p, i) {
        const slot = state.stepContents[i] || { content: '', svgSpec: null };
        if (slot.svgSpec) {
          steps.push({
            id: 'step' + (steps.length + 1),
            type: 'svg',
            content: '',
            svg_spec: slot.svgSpec
          });
        }
        const type = p.type === 'instruction' && !slot.content && !slot.svgSpec ? 'instruction' : p.type;
        if (type === 'completion') {
          steps.push({ id: 'step' + (steps.length + 1), type: 'completion', content: slot.content || 'Well done!' });
        } else if (type === 'instruction' || type === 'content') {
          steps.push({ id: 'step' + (steps.length + 1), type: 'instruction', content: slot.content || '' });
        } else {
          const stepId = 'step' + (steps.length + 1);
          const step = { id: stepId, type: type, content: slot.content || '' };
          if (type === 'quiz') {
            step.answer_options = ['Option A', 'Option B'];
            step.correct_index = 0;
          }
          if (type === 'fill_blank') step.blanks = [{ answer: 'answer' }];
          if (type === 'matching') step.pairs = [{ left: 'A', right: '1' }, { left: 'B', right: '2' }];
          if (type === 'ordering') {
            step.items = ['First', 'Second', 'Third'];
            step.correct_order = [0, 1, 2];
          }
          if (type === 'hardware_trigger') {
            step.sensor = 'accel.total';
            step.threshold = 'freefall > 0.3s';
          }
          steps.push(step);
        }
      });
      const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const lesson = {
        meta: {
          identifier: 'ols:custom:' + (slug || 'wizard') + '_v1',
          title: title,
          description: description,
          language: 'en',
          license: 'CC-BY-SA-4.0',
          created: new Date().toISOString(),
          difficulty: 2,
          tags: [],
          time_required: 'PT5M',
          utu: (state.protocol || state.bandRange) ? {
            protocol: state.protocol || undefined,
            band: state.bandRange ? state.bandRange.min : undefined
          } : {}
        },
        steps: steps.length ? steps : [{ id: 'step1', type: 'instruction', content: 'Add your content here.' }, { id: 'step2', type: 'completion', content: 'Well done!' }]
      };
      try {
        sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(lesson));
        navigateTo('#/author/new');
      } catch (e) {
        alert('Could not save draft. Copy your work and try again.');
      }
    });
  }

  render();
}

export function consumeWizardDraft() {
  try {
    const raw = sessionStorage.getItem(WIZARD_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(WIZARD_DRAFT_KEY);
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
