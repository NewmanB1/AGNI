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

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('popstate', handleRoute);
  handleRoute();
}
