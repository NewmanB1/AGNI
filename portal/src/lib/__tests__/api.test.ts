import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHubApi } from '../api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn()
});

function okJson(body: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    text: () => Promise.resolve(JSON.stringify(body))
  });
}

function errJson(body: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(body))
  });
}

describe('createHubApi', () => {
  let api: ReturnType<typeof createHubApi>;

  beforeEach(() => {
    mockFetch.mockReset();
    api = createHubApi('http://localhost:8082');
  });

  it('constructs with trailing slash on base URL', () => {
    expect(api.baseUrl).toBe('http://localhost:8082/');
  });

  it('handles base URL that already has trailing slash', () => {
    const a = createHubApi('http://localhost:8082/');
    expect(a.baseUrl).toBe('http://localhost:8082/');
  });

  it('handles empty base URL', () => {
    const a = createHubApi('');
    expect(a.baseUrl).toBeUndefined();
  });

  // ── GET requests ──────────────────────────────────────────────────────

  it('getTheta constructs correct URL', async () => {
    mockFetch.mockReturnValueOnce(okJson({ pseudoId: 's1', lessons: [] }));
    await api.getTheta('student-1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8082/api/theta?pseudoId=student-1',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getTheta encodes special characters in pseudoId', async () => {
    mockFetch.mockReturnValueOnce(okJson({ pseudoId: 'a&b', lessons: [] }));
    await api.getTheta('a&b');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('pseudoId=a%26b');
  });

  it('getThetaAll calls correct endpoint', async () => {
    mockFetch.mockReturnValueOnce(okJson({ students: {}, computedAt: '' }));
    await api.getThetaAll();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8082/api/theta/all',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getThetaGraph calls correct endpoint', async () => {
    mockFetch.mockReturnValueOnce(okJson({ edges: [] }));
    await api.getThetaGraph();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8082/api/theta/graph',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getLessons with no filters', async () => {
    mockFetch.mockReturnValueOnce(okJson({ lessons: [], savedSlugs: [], total: 0 }));
    await api.getLessons();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8082/api/lessons',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getLessons with filters', async () => {
    mockFetch.mockReturnValueOnce(okJson({ lessons: [], savedSlugs: [], total: 0 }));
    await api.getLessons({ utu: '3.1', spine: 'MAT', teaching_mode: 'individual' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('utu=3.1');
    expect(url).toContain('spine=MAT');
    expect(url).toContain('teaching_mode=individual');
  });

  it('getReviews calls correct URL', async () => {
    mockFetch.mockReturnValueOnce(okJson({ pseudoId: 's1', due: [], upcoming: [], total: 0 }));
    await api.getReviews('s1');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('api/reviews?pseudoId=s1');
  });

  it('getStreaks calls correct URL', async () => {
    mockFetch.mockReturnValueOnce(okJson({ currentStreak: 0, longestStreak: 0 }));
    await api.getStreaks('s1');
    expect(mockFetch.mock.calls[0][0]).toContain('api/streaks?pseudoId=s1');
  });

  it('getBadges calls correct URL', async () => {
    mockFetch.mockReturnValueOnce(okJson({ pseudoId: 's1', badges: [], stats: {} }));
    await api.getBadges('s1');
    expect(mockFetch.mock.calls[0][0]).toContain('api/badges?pseudoId=s1');
  });

  it('getLmsStatus calls correct endpoint', async () => {
    mockFetch.mockReturnValueOnce(okJson({ students: 0, lessons: 0 }));
    await api.getLmsStatus();
    expect(mockFetch.mock.calls[0][0]).toContain('api/lms/status');
  });

  it('getLmsSelect constructs URL with candidates', async () => {
    mockFetch.mockReturnValueOnce(okJson({ pseudoId: 's', selected: null, ability: null, candidates: 0 }));
    await api.getLmsSelect('s1', ['L1', 'L2']);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('pseudoId=s1');
    expect(url).toContain('candidates=L1%2CL2');
  });

  it('getGroups calls correct endpoint', async () => {
    mockFetch.mockReturnValueOnce(okJson({ groups: [] }));
    await api.getGroups();
    expect(mockFetch.mock.calls[0][0]).toContain('api/groups');
  });

  it('getParentChildren constructs correct URL', async () => {
    mockFetch.mockReturnValueOnce(okJson({ parentId: 'p1', children: [] }));
    await api.getParentChildren('p1');
    expect(mockFetch.mock.calls[0][0]).toContain('parentId=p1');
  });

  it('getDiagnosticProbes calls correct endpoint', async () => {
    mockFetch.mockReturnValueOnce(okJson({ probes: [] }));
    await api.getDiagnosticProbes();
    expect(mockFetch.mock.calls[0][0]).toContain('api/diagnostic');
  });

  it('getSkillGraph with and without pseudoId', async () => {
    mockFetch.mockReturnValueOnce(okJson({ nodes: [], edges: [], totalSkills: 0 }));
    await api.getSkillGraph();
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8082/api/skill-graph');

    mockFetch.mockReturnValueOnce(okJson({ nodes: [], edges: [], totalSkills: 0 }));
    await api.getSkillGraph('s1');
    expect(mockFetch.mock.calls[1][0]).toContain('pseudoId=s1');
  });

  it('getLearningPaths with and without pseudoId', async () => {
    mockFetch.mockReturnValueOnce(okJson({ paths: [] }));
    await api.getLearningPaths();
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8082/api/learning-paths');

    mockFetch.mockReturnValueOnce(okJson({ paths: [] }));
    await api.getLearningPaths('s1');
    expect(mockFetch.mock.calls[1][0]).toContain('pseudoId=s1');
  });

  it('getOnboardingStatus calls correct endpoint', async () => {
    mockFetch.mockReturnValueOnce(okJson({ isFirstRun: true }));
    await api.getOnboardingStatus();
    expect(mockFetch.mock.calls[0][0]).toContain('api/admin/onboarding-status');
  });

  // ── POST requests ─────────────────────────────────────────────────────

  it('postLmsObservation sends correct body', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true }));
    await api.postLmsObservation({ studentId: 's1', lessonId: 'L1', probeResults: [] });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ studentId: 's1', lessonId: 'L1', probeResults: [] });
  });

  it('postGroup sends correct body', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, group: { id: 'g1', name: 'A', studentIds: [] } }));
    await api.postGroup({ name: 'A' });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('api/groups');
    expect(opts.method).toBe('POST');
  });

  it('setRecommendationOverride sends correct body', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, override: 'L1' }));
    await api.setRecommendationOverride('s1', 'L1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ pseudoId: 's1', lessonId: 'L1' });
  });

  it('postParentInvite sends pseudoId', async () => {
    mockFetch.mockReturnValueOnce(okJson({ code: 'ABC', pseudoId: 's1', existing: false }));
    await api.postParentInvite('s1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.pseudoId).toBe('s1');
  });

  it('postParentLink sends code and parentId', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, pseudoId: 's1', alreadyLinked: false }));
    await api.postParentLink('ABC', 'parent1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ code: 'ABC', parentId: 'parent1' });
  });

  it('registerCreator sends name/email/password', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, creator: {} }));
    await api.registerCreator({ name: 'Test', email: 'a@b.com', password: 'pass123' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.email).toBe('a@b.com');
  });

  it('loginCreator sends email/password', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, token: 'tok', creator: {} }));
    await api.loginCreator({ email: 'a@b.com', password: 'pass' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.email).toBe('a@b.com');
  });

  it('postLearningPath sends correct body', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, path: {} }));
    await api.postLearningPath({ name: 'Test', skills: ['math'] });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe('Test');
    expect(body.skills).toEqual(['math']);
  });

  it('postDiagnostic sends pseudoId and responses', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, ability: 0, skillsBootstrapped: 0 }));
    await api.postDiagnostic('s1', [{ probeId: 'p1', skill: 'math', difficulty: 0, answer: 1 }]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.pseudoId).toBe('s1');
    expect(body.responses).toHaveLength(1);
  });

  it('postAuthorSave with compile option', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, slug: 'test', path: '', warnings: [] }));
    await api.postAuthorSave({ meta: {} }, { compile: true });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body._compile).toBe(true);
  });

  // ── PUT requests ──────────────────────────────────────────────────────

  it('putGroup sends PUT method', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, group: {} }));
    await api.putGroup({ id: 'g1', name: 'Updated' });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('PUT');
  });

  it('putLearningPath sends PUT method', async () => {
    mockFetch.mockReturnValueOnce(okJson({ ok: true, path: {} }));
    await api.putLearningPath({ id: 'p1', name: 'Updated' });
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('throws on HTTP error with server error message', async () => {
    mockFetch.mockReturnValueOnce(errJson({ error: 'Not found' }, 404));
    await expect(api.getTheta('s1')).rejects.toThrow('Not found');
  });

  it('throws on HTTP error with plain text body', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error')
    }));
    await expect(api.getTheta('s1')).rejects.toThrow('Internal Server Error');
  });

  it('throws on invalid JSON response', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not json')
    }));
    await expect(api.getTheta('s1')).rejects.toThrow('Invalid JSON');
  });

  // ── Auth headers ──────────────────────────────────────────────────────

  it('authGet includes Bearer token from localStorage', async () => {
    const localStorageMock = { getItem: vi.fn(() => 'mytoken'), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', localStorageMock);
    const authedApi = createHubApi('http://localhost:8082');

    mockFetch.mockReturnValueOnce(okJson({ creator: {} }));
    await authedApi.getCreatorSession();
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer mytoken');

    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
  });

  it('authGet omits Authorization when no token', async () => {
    mockFetch.mockReturnValueOnce(okJson({ creator: {} }));
    await api.getCreatorSession();
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });
});
