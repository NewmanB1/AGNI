/**
 * Hub API client - vanilla JS, no framework deps
 */
const HUB_URL_KEY = 'agni_hub_url';

export function getHubUrl() {
  if (typeof window === 'undefined') return '';
  const env = window.__AGNI_HUB_URL;
  if (env) return env;
  return localStorage.getItem(HUB_URL_KEY) || '';
}

export function setHubUrl(url) {
  const u = (url || '').replace(/\/+$/, '');
  localStorage.setItem(HUB_URL_KEY, u);
  return u;
}

function ensureTrailingSlash(base) {
  return base.endsWith('/') ? base : base + '/';
}

async function parseJson(res) {
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('agni_creator_token');
      if (window.location.hash && !window.location.hash.includes('author/login')) {
        window.location.hash = '#/author/login?expired=1';
      }
    }
    let err = {};
    try { err = JSON.parse(text); } catch (_) {}
    throw new Error(err.error || text || `HTTP ${res.status}`);
  }
  try { return JSON.parse(text); } catch (_) { throw new Error('Invalid JSON'); }
}

function authHeaders() {
  const token = localStorage.getItem('agni_creator_token');
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export function createHubApi(baseUrl) {
  const base = baseUrl ? ensureTrailingSlash(String(baseUrl).replace(/\/+$/, '')) : '';

  async function get(path) {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    return parseJson(res);
  }

  async function post(path, body) {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    return parseJson(res);
  }

  async function authGet(path) {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'GET',
      headers: authHeaders()
    });
    return parseJson(res);
  }

  async function authPost(path, body) {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    return parseJson(res);
  }

  async function authPut(path, body) {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    return parseJson(res);
  }

  async function authDelete(path) {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'DELETE',
      headers: authHeaders()
    });
    return parseJson(res);
  }

  return {
    baseUrl: base || undefined,

    getHealth() {
      return get('health').catch(() => null);
    },

    postAuthLogin(body) {
      return post('api/auth/login', body);
    },

    postAuthRegister(body) {
      return post('api/auth/register', body);
    },

    getCreatorSession() {
      return authGet('api/auth/me');
    },

    getAuthorLessons() {
      return authGet('api/author/lessons');
    },

    getAuthorLesson(slug) {
      return authGet(`api/author/load/${encodeURIComponent(slug)}`);
    },

    getAuthorSensors() {
      return authGet('api/author/sensors');
    },

    getUtuConstants() {
      return authGet('api/governance/utu-constants');
    },

    postAuthorValidate(lesson) {
      return authPost('api/author/validate', lesson);
    },

    postAuthorPreview(lesson) {
      return authPost('api/author/preview', lesson);
    },

    postAuthorSave(lesson, opts) {
      const payload = opts?.compile ? { ...lesson, _compile: true } : lesson;
      return authPost('api/author/save', payload);
    },

    deleteAuthorLesson(slug) {
      return authDelete(`api/author/delete/${encodeURIComponent(slug)}`);
    },

    getGroups() {
      return authGet('api/groups');
    },

    postGroup(body) {
      return authPost('api/groups', body);
    },

    putGroup(body) {
      return authPut('api/groups', body);
    },

    assignGroupLesson(groupId, lessonId) {
      return authPost(`api/groups/${encodeURIComponent(groupId)}/assign`, { lessonId });
    },

    getThetaAll() {
      return authGet('api/theta/all');
    },

    getTheta(pseudoId) {
      return authGet(`api/theta?pseudoId=${encodeURIComponent(pseudoId)}`);
    },

    getLessons(filters = {}) {
      const params = new URLSearchParams();
      if (filters.utu) params.set('utu', filters.utu);
      if (filters.spine) params.set('spine', filters.spine);
      const qs = params.toString();
      return authGet('api/lessons' + (qs ? '?' + qs : ''));
    },

    getCollabSessions() {
      return authGet('api/collab/sessions');
    },

    denyCollabSession(sessionId) {
      return authPost(`api/collab/sessions/${encodeURIComponent(sessionId)}/deny`, {});
    }
  };
}
