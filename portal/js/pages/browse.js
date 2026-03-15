/**
 * Browse & search: lessons, SVGs, sensor toys.
 * Filters: creator (mine/others/all), text search, UTU, spine, etc.
 * Enables forking a lesson from the lesson creation wizard.
 */

import { getHubUrl, createHubApi } from '../api.js';
import { getStoredToken } from '../auth.js';
import { navigateTo } from '../router.js';

const WIZARD_DRAFT_KEY = 'lessonCreationWizard_draft';

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function isForkMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('fork') === '1' || params.get('fork') === 'true';
}

export function renderBrowse(main, opts) {
  opts = opts || {};
  const forkFromUrl = isForkMode();
  const mode = opts.mode || (forkFromUrl ? 'fork' : 'browse');
  const onForkSelect = opts.onForkSelect || (forkFromUrl ? function (lesson, slug) {
    const forked = JSON.parse(JSON.stringify(lesson));
    const meta = forked.meta || {};
    meta.identifier = 'ols:custom:fork-' + (slug || 'lesson').replace(/\s+/g, '-') + '_v1';
    meta.title = (meta.title || 'Forked lesson') + ' (fork)';
    if (meta.uri) delete meta.uri;
    if (meta.content_hash) delete meta.content_hash;
    forked.meta = meta;
    try {
      sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(forked));
      navigateTo('#/author/new');
    } catch (e) {
      alert('Could not save draft.');
    }
  } : null);

  if (!getStoredToken()) {
    main.innerHTML = '<div class="top-page card"><p>Please <a href="#/author/login">log in</a> to browse lessons and SVGs.</p></div>';
    return;
  }

  const baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = '<div class="top-page card"><p>Set the <a href="#/settings">Hub URL</a> in Settings to browse.</p></div>';
    return;
  }

  const api = createHubApi(baseUrl);
  let activeTab = 'lessons';
  let filters = { q: '', scope: '', utu: '', spine: '', limit: 50, offset: 0 };
  let result = { lessons: [], total: 0, savedSlugs: [] };
  let loading = false;

  function applyFiltersForTab() {
    const f = { limit: 50, offset: 0 };
    if (filters.q) f.q = filters.q;
    if (filters.scope) f.scope = filters.scope;
    if (filters.utu) f.utu = filters.utu;
    if (filters.spine) f.spine = filters.spine;
    if (filters.teaching_mode) f.teaching_mode = filters.teaching_mode;
    if (activeTab === 'svgs') f.hasVisuals = true;
    if (activeTab === 'toys') f.hasSensor = true;
    return f;
  }

  function load() {
    loading = true;
    api.getBrowseLessons(applyFiltersForTab()).then(function (r) {
      result.lessons = r.lessons || [];
      result.total = r.total != null ? r.total : result.lessons.length;
      result.savedSlugs = r.savedSlugs || [];
      loading = false;
      render();
    }).catch(function (e) {
      result.lessons = [];
      result.total = 0;
      result.error = e && e.message ? e.message : 'Load failed';
      loading = false;
      render();
    });
  }

  function render() {
    const savedSet = new Set(result.savedSlugs || []);
    const list = (result.lessons || []).map(function (l) {
      const isMine = savedSet.has(l.slug);
      const forkAllowed = mode === 'fork' ? null : true;
      return {
        slug: l.slug,
        title: l.title || l.slug,
        description: l.description || '',
        isMine,
        factoryManifest: l.factoryManifest || [],
        hasSensor: (l.inferredFeatures && l.inferredFeatures.flags && l.inferredFeatures.flags.has_sensors) || (l.inferredFeatures && l.inferredFeatures.stepTypeCounts && l.inferredFeatures.stepTypeCounts.hardware_trigger > 0)
      };
    });

    const scopeOptions = '<option value="">All</option><option value="mine"' + (filters.scope === 'mine' ? ' selected' : '') + '>My lessons</option><option value="others"' + (filters.scope === 'others' ? ' selected' : '') + '>Others</option>';
    const tabsHtml = '<div class="browse-tabs" role="tablist">' +
      '<button type="button" role="tab" class="browse-tab' + (activeTab === 'lessons' ? ' active' : '') + '" data-tab="lessons">Lessons</button>' +
      '<button type="button" role="tab" class="browse-tab' + (activeTab === 'svgs' ? ' active' : '') + '" data-tab="svgs">SVGs</button>' +
      '<button type="button" role="tab" class="browse-tab' + (activeTab === 'toys' ? ' active' : '') + '" data-tab="toys">Sensor toys</button>' +
      '</div>';
    const filtersHtml = '<div class="browse-filters card">' +
      '<div class="wizard-form" style="display:grid;grid-template-columns:1fr 1fr auto;gap:0.75rem;align-items:end;flex-wrap:wrap;">' +
      '<div class="wizard-field"><label for="browse-q">Search</label><input type="text" id="browse-q" class="input" placeholder="Title, description, slug" value="' + escapeHtml(filters.q) + '" /></div>' +
      '<div class="wizard-field"><label for="browse-scope">Creator</label><select id="browse-scope" class="input">' + scopeOptions + '</select></div>' +
      '<div class="wizard-field"><label for="browse-utu">UTU class</label><input type="text" id="browse-utu" class="input" placeholder="e.g. MAC-1" value="' + escapeHtml(filters.utu) + '" style="max-width:120px;" /></div>' +
      '<div class="wizard-field"><label for="browse-spine">Spine</label><input type="text" id="browse-spine" class="input" placeholder="e.g. MAC" value="' + escapeHtml(filters.spine) + '" style="max-width:100px;" /></div>' +
      '<div class="wizard-field"><button type="button" class="btn btn-primary" id="browse-search">Search</button></div>' +
      '</div></div>';
    let listHtml = '';
    if (result.error) {
      listHtml = '<div class="card error-box">' + escapeHtml(result.error) + '</div>';
    } else if (loading) {
      listHtml = '<div class="card"><p>Loading…</p></div>';
    } else if (list.length === 0) {
      listHtml = '<div class="card"><p>No lessons found. Try changing filters or scope.</p></div>';
    } else {
      listHtml = '<div class="card"><p class="hint">' + result.total + ' result(s)</p><ul class="browse-list">' +
        list.map(function (item) {
          let badge = '';
          if (activeTab === 'svgs' && item.factoryManifest.length) badge = ' <span class="svg-step-badge">' + escapeHtml(item.factoryManifest.slice(0, 3).join(', ')) + (item.factoryManifest.length > 3 ? '…' : '') + '</span>';
          if (activeTab === 'toys' && item.hasSensor) badge = ' <span class="svg-step-badge">sensor</span>';
          return '<li class="browse-item">' +
            '<div><strong>' + escapeHtml(item.title) + '</strong>' + (item.isMine ? ' <span class="hint">(mine)</span>' : '') + badge + '</div>' +
            (item.description ? '<div class="hint" style="font-size:0.9rem;">' + escapeHtml(item.description.slice(0, 120)) + (item.description.length > 120 ? '…' : '') + '</div>' : '') +
            '<div style="margin-top:0.5rem;">' +
            '<a href="#/author/' + encodeURIComponent(item.slug) + '/edit" class="btn btn-sm">Edit</a> ' +
            (mode === 'fork' ? '<button type="button" class="btn btn-sm btn-primary browse-fork-btn" data-slug="' + escapeHtml(item.slug) + '">Fork</button>' : '') +
            '</div></li>';
        }).join('') +
        '</ul></div>';
    }

    const backLink = forkFromUrl ? '<p><a href="#/author/wizard">← Back to lesson wizard</a></p>' : '';
    main.innerHTML = '<div class="top-page">' +
      '<h1>Browse</h1>' +
      '<p class="tagline">Search lessons, SVGs, and sensor toys. ' + (mode === 'fork' ? 'Pick one to fork into a new lesson.' : '') + '</p>' +
      backLink +
      tabsHtml +
      filtersHtml +
      listHtml +
      '</div>';

    main.querySelectorAll('.browse-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-tab');
        load();
      });
    });
    main.querySelector('#browse-search').addEventListener('click', function () {
      filters.q = (main.querySelector('#browse-q') && main.querySelector('#browse-q').value) || '';
      filters.scope = (main.querySelector('#browse-scope') && main.querySelector('#browse-scope').value) || '';
      filters.utu = (main.querySelector('#browse-utu') && main.querySelector('#browse-utu').value) || '';
      filters.spine = (main.querySelector('#browse-spine') && main.querySelector('#browse-spine').value) || '';
      load();
    });
    main.querySelectorAll('.browse-fork-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const slug = btn.getAttribute('data-slug');
        if (!slug || !onForkSelect) return;
        api.getForkCheck(slug).then(function (r) {
          if (r.forkAllowed) {
            api.getAuthorLesson(slug).then(function (data) {
              const lesson = data.lessonData || data.lesson || data;
              onForkSelect(lesson, slug);
            }).catch(function (e) {
              alert('Could not load lesson: ' + (e && e.message ? e.message : 'Unknown error'));
            });
          } else {
            alert('This lesson cannot be forked. It may be marked unforkable by governance or the license does not allow forking.');
          }
        }).catch(function (e) {
          alert('Fork check failed: ' + (e && e.message ? e.message : 'Unknown error'));
        });
      });
    });
  }

  load();
}
