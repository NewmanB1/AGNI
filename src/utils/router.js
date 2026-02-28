'use strict';

/**
 * Lightweight HTTP router for the AGNI hub API.
 * Supports static paths and :param path segments.
 */

class Router {
  constructor() {
    this._routes = [];
  }

  get(path, handler)    { this._routes.push({ method: 'GET',    path, handler }); return this; }
  post(path, handler)   { this._routes.push({ method: 'POST',   path, handler }); return this; }
  put(path, handler)    { this._routes.push({ method: 'PUT',    path, handler }); return this; }
  delete(path, handler) { this._routes.push({ method: 'DELETE', path, handler }); return this; }

  /**
   * Match a request to a registered route.
   * @param {string} method
   * @param {string} urlPath
   * @returns {{ handler: Function, params: Record<string, string> } | null}
   */
  match(method, urlPath) {
    for (const route of this._routes) {
      if (route.method !== method) continue;
      const params = matchPath(route.path, urlPath);
      if (params !== null) return { handler: route.handler, params };
    }
    return null;
  }

  /**
   * Check if any route is registered for this path (any method).
   * Used for 405 vs 404 differentiation.
   */
  hasPath(urlPath) {
    return this._routes.some(r => matchPath(r.path, urlPath) !== null);
  }
}

function matchPath(pattern, urlPath) {
  const patternParts = pattern.split('/');
  const urlParts = urlPath.split('/');
  if (patternParts.length !== urlParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patternParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

module.exports = { Router };
