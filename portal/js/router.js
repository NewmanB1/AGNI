/**
 * Hash-based router - no dependencies
 */

const routes = new Map();

export function route(path, handler) {
  routes.set(path, handler);
}

export function getPath() {
  const hash = window.location.hash || '#/';
  const q = hash.indexOf('?');
  return (q >= 0 ? hash.slice(1, q) : hash.slice(1) || '/').replace(/^\/+|\/+$/, '') || '/';
}

export function getParams() {
  const hash = window.location.hash || '#/';
  const q = hash.indexOf('?');
  return new URLSearchParams(q >= 0 ? hash.slice(q) : '');
}

export function getRouteParams() {
  const path = getPath();
  const parts = path === '/' ? [] : path.split('/').filter(Boolean);
  const params = {};
  const normalized = '/' + parts.join('/');
  for (const [pattern, handler] of routes) {
    const pParts = pattern === '/' ? [] : pattern.split('/').filter(Boolean);
    if (pParts.length !== parts.length) continue;
    let match = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) {
        params[pParts[i].slice(1)] = parts[i];
      } else if (pParts[i] !== parts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { path: normalized, parts, params, handler };
  }
  return { path: normalized, parts, params, handler: routes.get('/') || (() => {}) };
}

export function navigateTo(path, replace = false) {
  const newHash = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) history.replaceState(null, '', newHash);
  else history.pushState(null, '', newHash);
  handleRoute();
}

function handleRoute() {
  const { handler, params, path, parts } = getRouteParams();
  if (typeof handler === 'function') {
    handler({ path, parts, ...params });
  }
}

function editorRoutePattern(path) {
  if (!path || path === '/') return false;
  if (path === 'author/new') return true;
  return /^author\/[^/]+\/edit$/.test(path);
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('popstate', handleRoute);
  window.addEventListener(
    'click',
    function (e) {
      if (!window.__AGNI_EDITOR_DIRTY || !editorRoutePattern(getPath())) return;
      var t = e.target;
      if (!t || !t.closest) return;
      var a = t.closest('a[href^="#"]');
      if (!a) return;
      var href = (a.getAttribute('href') || '').replace(/^#/, '') || '/';
      var cur = getPath();
      if (href === cur) return;
      if (
        /^author\/[^/]+\/edit$/.test(href) &&
        /^author\/[^/]+\/edit$/.test(cur) &&
        href.split('/')[1] === cur.split('/')[1]
      )
        return;
      if (!window.confirm('You have unsaved changes. Leave the editor without saving?')) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        window.__AGNI_EDITOR_DIRTY = false;
      }
    },
    true
  );
  handleRoute();
}
