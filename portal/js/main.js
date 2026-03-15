/**
 * AGNI Portal - vanilla HTML/CSS/JS
 */
import { route, initRouter } from './router.js';
import { getHubUrl } from './api.js';
import { restoreCreatorSession } from './auth.js';
import { applyNavI18n, t } from './i18n.js';
import { showRouteLoading, hideRouteLoading } from './route-loading.js';
import { render as renderHome } from './pages/home.js';
import { render as renderSettings } from './pages/settings.js';
import { renderAuthorList, renderAuthorLogin, renderAuthorNew, renderLessonCreationWizard } from './pages/author.js';
import { renderBrowse } from './pages/browse.js';
import { renderGroups, renderGroupsAssign } from './pages/groups.js';
import { renderGovernance } from './pages/governance.js';
import { renderLeaderboard } from './pages/leaderboard.js';
import { renderStub } from './pages/stub.js';
import { renderCollab } from './pages/collab.js';
import { renderLearn } from './pages/learn.js';
import { renderStudentsRoster } from './pages/students-roster.js';
import { renderParent } from './pages/parent.js';

const main = document.getElementById('main-content');
let prevCleanup = null;

function setActiveNav(path) {
  document.querySelectorAll('#main-nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const targetPath = href.replace('#', '') || '/';
    a.classList.toggle('active', path === targetPath || (targetPath !== '/' && path.startsWith(targetPath)));
  });
}

function render(handler) {
  return (ctx) => {
    showRouteLoading();
    if (typeof prevCleanup === 'function') {
      prevCleanup();
      prevCleanup = null;
    }
    setActiveNav(ctx.path);
    const result = handler(main, ctx);
    prevCleanup = typeof result === 'function' ? result : null;
    requestAnimationFrame(function () {
      hideRouteLoading();
    });
  };
}

route('/', render(renderHome));
route('/settings', render(renderSettings));
route('/author', render(renderAuthorList));
route('/author/login', render(renderAuthorLogin));
route('/author/wizard', render((m) => renderLessonCreationWizard(m)));
route('/author/browse', render((m) => renderBrowse(m)));
route('/author/new', render((m) => renderAuthorNew(m, null)));
route('/author/:slug/edit', render((m, ctx) => renderAuthorNew(m, ctx.slug)));

route('/hub', render((m) => renderStub(m, 'Teacher Hub', 'Class overview, heterogeneity, and recommendations.', {
  detail: 'Connect the portal to your hub in Settings, then use Groups and Author for day-to-day tasks.',
  ctaHref: '#/groups',
  ctaLabel: 'Student groups',
  secondaryHref: '#/settings',
  secondaryLabel: 'Hub settings'
})));
route('/hub/collab', render((m) => renderCollab(m)));
route('/groups', render(renderGroups));
route('/groups/:id/assign', render((m, ctx) => renderGroupsAssign(m, ctx)));
route('/students', render(renderStudentsRoster));
route('/learn', render(renderLearn));
route('/parent/dashboard', render(renderParent));
route('/governance/setup', render((m) => renderGovernance(m)));
route('/leaderboard', render((m) => renderLeaderboard(m)));
route('/admin/onboarding', render((m) => renderStub(m, t('stub_admin_title'), t('stub_admin_desc'), {
  detail: t('stub_admin_detail'),
  ctaHref: '#/settings',
  ctaLabel: t('stub_admin_cta_settings'),
  secondaryHref: '#/governance/setup',
  secondaryLabel: t('stub_admin_secondary_gov')
})));
route('/admin/hub', render((m) => renderStub(m, t('stub_admin_hub_title'), t('stub_admin_hub_desc'), {
  detail: t('stub_admin_hub_detail'),
  ctaHref: '#/settings',
  ctaLabel: t('stub_admin_hub_cta_url'),
  secondaryHref: '#/',
  secondaryLabel: t('stub_admin_hub_secondary_home')
})));

const params = new URLSearchParams(window.location.search);
const hubParam = params.get('hub');
if (hubParam) {
  window.__AGNI_HUB_URL = hubParam;
}

async function init() {
  applyNavI18n();
  await restoreCreatorSession();
  initRouter();
}

document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
  const btn = document.getElementById('mobile-menu-btn');
  const nav = document.getElementById('main-nav');
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', !expanded);
  nav.classList.toggle('mobile-open', !expanded);
});

document.querySelectorAll('#main-nav a').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (a.getAttribute('href').startsWith('#')) {
      document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
      document.getElementById('main-nav')?.classList.remove('mobile-open');
    }
  });
});

init();
