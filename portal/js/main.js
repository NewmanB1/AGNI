/**
 * AGNI Portal - vanilla HTML/CSS/JS
 */
import { route, initRouter, getPath } from './router.js';
import { getHubUrl } from './api.js';
import { restoreCreatorSession } from './auth.js';
import { render as renderHome } from './pages/home.js';
import { render as renderSettings } from './pages/settings.js';
import { renderAuthorList, renderAuthorLogin, renderAuthorNew } from './pages/author.js';
import { renderGroups, renderGroupsAssign } from './pages/groups.js';
import { renderStub } from './pages/stub.js';

const main = document.getElementById('main-content');

function setActiveNav(path) {
  document.querySelectorAll('#main-nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const targetPath = href.replace('#', '') || '/';
    a.classList.toggle('active', path === targetPath || (targetPath !== '/' && path.startsWith(targetPath)));
  });
}

function render(handler) {
  return (ctx) => {
    setActiveNav(ctx.path);
    handler(main, ctx);
  };
}

// Routes
route('/', render(renderHome));
route('/settings', render(renderSettings));
route('/author', render(renderAuthorList));
route('/author/login', render(renderAuthorLogin));
route('/author/new', render((m) => renderAuthorNew(m, null)));
route('/author/:slug/edit', render((m, ctx) => renderAuthorNew(m, ctx.slug)));

route('/hub', render((m) => renderStub(m, 'Teacher Hub', 'Class overview and recommendations.')));
route('/groups', render(renderGroups));
route('/groups/:id/assign', render((m, ctx) => renderGroupsAssign(m, ctx)));
route('/students', render((m) => renderStub(m, 'Students', 'Student roster.')));
route('/learn', render((m) => renderStub(m, 'Learn', 'Student dashboard.')));
route('/parent/dashboard', render((m) => renderStub(m, 'Parent Dashboard', 'Link children and view progress.')));
route('/governance/setup', render((m) => renderStub(m, 'Governance', 'Policy and catalog.')));
route('/admin/onboarding', render((m) => renderStub(m, 'Admin', 'First-run setup.')));
route('/admin/hub', render((m) => renderStub(m, 'Admin Hub', 'Hub configuration.')));

// Hub URL from query param (e.g. ?hub=http://localhost:8082) or env
const params = new URLSearchParams(window.location.search);
const hubParam = params.get('hub');
if (hubParam) {
  window.__AGNI_HUB_URL = hubParam;
}

// Init
async function init() {
  await restoreCreatorSession();
  initRouter();
}

// Mobile menu
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
  const btn = document.getElementById('mobile-menu-btn');
  const nav = document.getElementById('main-nav');
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', !expanded);
  nav.classList.toggle('mobile-open', !expanded);
});

// Nav links - use hash, no default
document.querySelectorAll('#main-nav a').forEach(a => {
  a.addEventListener('click', (e) => {
    if (a.getAttribute('href').startsWith('#')) {
      document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
      document.getElementById('main-nav')?.classList.remove('mobile-open');
    }
  });
});

init();
