/**
 * Typed Hub API client for the AGNI portal.
 * Consume only this and docs/api-contract.md; do not call engine/compiler internals.
 *
 * Hub URL can be set at runtime via Settings (localStorage) or at build time via VITE_HUB_URL.
 */
import { writable, derived } from 'svelte/store';

// ─── Response types (match docs/api-contract.md) ─────────────────────────────

export interface ThetaLessonEntry {
  lessonId: string;
  slug: string;
  title: string;
  theta: number;
  baseCost: number;
  residualFactor: number;
  transferBenefit: number;
  alreadyMastered: boolean;
  skillsProvided: Array<{ skill: string; declaredLevel?: number }>;
  skillsRequired: string[];
}

export interface ThetaResponse {
  pseudoId: string;
  lessons: ThetaLessonEntry[];
  computedAt: string;
  cached: boolean;
  graphSource?: string;
  /** Set when a teacher override is active for this student (Phase 3). */
  override?: string;
}

export interface ThetaAllResponse {
  students: Record<string, ThetaLessonEntry[]>;
  computedAt: string;
}

export interface GraphWeightsResponse {
  edges?: Array<{ from: string; to: string; weight: number; confidence?: number }>;
  sample_size?: number;
  default_weight?: number;
  level?: string;
}

export interface LmsSelectResponse {
  pseudoId: string;
  selected: string | null;
  ability: { ability: number; variance: number } | null;
  candidates: number;
}

export interface LmsObservationBody {
  studentId: string;
  lessonId: string;
  probeResults: Array<{ probeId: string; correct: boolean }>;
}

export interface LmsStatusResponse {
  students: number;
  lessons: number;
  probes: number;
  observations: number;
  embeddingDim: number;
  featureDim: number;
  statePath: string;
}

export interface BanditSummary {
  mean: number[];
  precision: number[][];
  sampleSize: number;
}

export interface LessonSidecar {
  identifier: string;
  slug: string;
  title: string;
  language: string;
  difficulty: number;
  utu?: { class?: string; band?: number };
  teaching_mode?: string;
  compiledAt?: string;
  schemaVersion?: string;
  metadata_source?: string;
  ontology?: { requires: unknown[]; provides: unknown[] };
  gate?: unknown;
  inferredFeatures?: unknown;
  katexAssets?: string[];
  factoryManifest?: string[];
}

export interface GovernanceReport {
  byUtu: Record<string, { lessons: number; skills: string[]; studentMasteryCount: number }>;
  bySkill: Record<string, { lessons: number; studentMasteryCount: number }>;
  studentCount: number;
  lessonCount: number;
}

export interface UtuConstants {
  protocols?: Array<{ id: number; name: string; short: string; cognitiveRole?: string; failureMode?: string }>;
  spineIds?: string[];
  spines?: Record<string, { name: string; ids: string[]; items: Array<{ id: string; description: string }> }>;
  bands?: Array<{ id: number; phase: string }>;
}

export interface ComplianceResult {
  status: 'ok' | 'warning' | 'fail';
  issues: string[];
}

export interface ApprovedCatalog {
  lessonIds: string[];
  provenance?: { sourceAuthorityId?: string; exportedAt?: string; version?: string };
}

export interface CatalogUpdateBody {
  add?: string[];
  remove?: string[];
  lessonIds?: string[];
}

export interface CatalogImportBody {
  catalog: ApprovedCatalog;
  strategy: 'replace' | 'merge' | 'add-only';
}

export interface StudentGroup {
  id: string;
  name: string;
  studentIds: string[];
}

export interface GroupsResponse {
  groups: StudentGroup[];
}

export interface LessonIndexEntry {
  lessonId: string;
  slug: string;
  title: string;
  difficulty: number;
  language: string;
  compiledAt?: string | null;
  metadata_source?: string;
  utu?: { class?: string; band?: number } | null;
  teaching_mode?: string | null;
  skillsProvided: Array<{ skill: string; declaredLevel?: number }>;
  skillsRequired: string[];
  inferredFeatures?: unknown;
  katexAssets?: string[];
  factoryManifest?: string[];
}

export interface LessonListResponse {
  lessons: LessonIndexEntry[];
  savedSlugs: string[];
  total: number;
}

export interface ReviewEntry {
  lessonId: string;
  interval: number;
  easeFactor: number;
  repetition: number;
  lastReviewAt: number;
  nextReviewAt: number;
  quality: number;
  overdue: boolean;
}

export interface ReviewScheduleResponse {
  pseudoId: string;
  due: ReviewEntry[];
  upcoming: ReviewEntry[];
  total: number;
}

export interface StepAnalytics {
  stepId: string;
  type: string;
  passed: boolean;
  attempts: number;
  durationMs: number;
  skipped: boolean;
}

export interface ParentChildProgress {
  pseudoId: string;
  linkedAt: string;
  mastery: Record<string, number>;
  completedSkills: number;
  totalSkills: number;
  recommendedLessons: { lessonId: string; score?: number }[];
  currentOverride: string | null;
}

// ─── Client ─────────────────────────────────────────────────────────────────

function ensureTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : base + '/';
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    const err = (() => {
      try {
        return JSON.parse(text) as { error?: string };
      } catch {
        return {};
      }
    })();
    throw new Error(err.error || text || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

export function createHubApi(baseUrl: string) {
  const base = baseUrl ? ensureTrailingSlash(baseUrl.replace(/\/+$/, '')) : '';

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    return parseJson<T>(res);
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    return parseJson<T>(res);
  }

  async function put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(base + path.replace(/^\//, ''), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    return parseJson<T>(res);
  }

  return {
    baseUrl: base || undefined,

    getTheta(pseudoId: string): Promise<ThetaResponse> {
      return get<ThetaResponse>(`api/theta?pseudoId=${encodeURIComponent(pseudoId)}`);
    },

    getThetaAll(): Promise<ThetaAllResponse> {
      return get<ThetaAllResponse>('api/theta/all');
    },

    getReviews(pseudoId: string): Promise<ReviewScheduleResponse> {
      return get<ReviewScheduleResponse>(`api/reviews?pseudoId=${encodeURIComponent(pseudoId)}`);
    },

    getThetaGraph(): Promise<GraphWeightsResponse> {
      return get<GraphWeightsResponse>('api/theta/graph');
    },

    /** @deprecated Use getLessons() instead. */
    getLessonIndex(filters?: { utu?: string; spine?: string; teaching_mode?: string }): Promise<LessonListResponse> {
      return this.getLessons(filters);
    },

    getStreaks(pseudoId: string): Promise<{ currentStreak: number; longestStreak: number; totalSessions: number; todayCount: number; dailyGoal: number; goalMet: boolean; dates: string[] }> {
      return get<any>(`api/streaks?pseudoId=${encodeURIComponent(pseudoId)}`);
    },

    getCollabStats(lessonIds: string[]): Promise<{ stats: Record<string, { activeCount: number; completedCount: number }> }> {
      const ids = lessonIds.join(',');
      return get<any>(`api/collab/stats?lessonIds=${encodeURIComponent(ids)}`);
    },

    getStepAnalytics(lessonId: string): Promise<{ lessonId: string; steps: any[]; totalEvents: number }> {
      return get<any>(`api/step-analytics?lessonId=${encodeURIComponent(lessonId)}`);
    },

    getMasteryHistory(pseudoId: string): Promise<{ pseudoId: string; snapshots: any[]; totalLessons: number }> {
      return get<any>(`api/mastery-history?pseudoId=${encodeURIComponent(pseudoId)}`);
    },

    getSkillGraph(pseudoId?: string): Promise<{ nodes: any[]; edges: any[]; totalSkills: number }> {
      const qs = pseudoId ? `?pseudoId=${encodeURIComponent(pseudoId)}` : '';
      return get<any>(`api/skill-graph${qs}`);
    },

    /** Phase 3: set or clear teacher recommendation override. */
    setRecommendationOverride(pseudoId: string, lessonId: string | null): Promise<{ ok: boolean; override: string | null }> {
      return post<{ ok: boolean; override: string | null }>('api/theta/override', { pseudoId, lessonId });
    },

    /** Student groups (CRUD). */
    getGroups(): Promise<GroupsResponse> {
      return get<GroupsResponse>('api/groups');
    },
    postGroup(body: { name: string; studentIds?: string[] }): Promise<{ ok: boolean; group: StudentGroup }> {
      return post<{ ok: boolean; group: StudentGroup }>('api/groups', body);
    },
    putGroup(body: { id: string; name?: string; studentIds?: string[] }): Promise<{ ok: boolean; group: StudentGroup }> {
      return put<{ ok: boolean; group: StudentGroup }>('api/groups', body);
    },
    assignGroupLesson(groupId: string, lessonId: string): Promise<{ ok: boolean; lessonId: string; assigned: number; skipped: number; assignedIds: string[]; skippedIds: string[] }> {
      return post('api/groups/' + encodeURIComponent(groupId) + '/assign', { lessonId });
    },

    /** POST /api/parent/invite (P1): teacher creates invite code for a student. */
    postParentInvite(pseudoId: string): Promise<{ code: string; pseudoId: string; existing: boolean }> {
      return post('api/parent/invite', { pseudoId });
    },

    /** POST /api/parent/link (P1): parent redeems invite code. */
    postParentLink(code: string, parentId: string): Promise<{ ok: boolean; pseudoId: string; alreadyLinked: boolean }> {
      return post('api/parent/link', { code, parentId });
    },

    /** GET /api/parent/children (P1): list children linked to a parent. */
    getParentChildren(parentId: string): Promise<{ parentId: string; children: { pseudoId: string; linkedAt: string }[] }> {
      return get('api/parent/children?parentId=' + encodeURIComponent(parentId));
    },

    /** GET /api/parent/child/:pseudoId/progress (P1): parent views child progress. */
    getParentChildProgress(pseudoId: string, parentId: string): Promise<ParentChildProgress> {
      return get('api/parent/child/' + encodeURIComponent(pseudoId) + '/progress?parentId=' + encodeURIComponent(parentId));
    },

    getLmsSelect(pseudoId: string, candidateIds: string[]): Promise<LmsSelectResponse> {
      const candidates = candidateIds.join(',');
      return get<LmsSelectResponse>(`api/lms/select?pseudoId=${encodeURIComponent(pseudoId)}&candidates=${encodeURIComponent(candidates)}`);
    },

    postLmsObservation(body: LmsObservationBody): Promise<{ ok: boolean }> {
      return post<{ ok: boolean }>('api/lms/observation', body);
    },

    getLmsStatus(): Promise<LmsStatusResponse> {
      return get<LmsStatusResponse>('api/lms/status');
    },

    getLessonSidecar(slug: string): Promise<LessonSidecar> {
      return get<LessonSidecar>(`lessons/${encodeURIComponent(slug)}/sidecar`);
    },

    /** GET /api/lessons (S2): lesson index with optional filters. */
    getLessons(filters?: { utu?: string; spine?: string; teaching_mode?: string }): Promise<LessonListResponse> {
      const params = new URLSearchParams();
      if (filters?.utu) params.set('utu', filters.utu);
      if (filters?.spine) params.set('spine', filters.spine);
      if (filters?.teaching_mode) params.set('teaching_mode', filters.teaching_mode);
      const qs = params.toString();
      return get<LessonListResponse>('api/lessons' + (qs ? '?' + qs : ''));
    },

    /** GET /api/author/load/:slug (E9): load saved YAML lesson for round-trip editing. */
    async getAuthorLesson(slug: string): Promise<{ slug: string; lessonData: Record<string, unknown> }> {
      return get<{ slug: string; lessonData: Record<string, unknown> }>(`api/author/load/${encodeURIComponent(slug)}`);
    },

    /** POST /api/author/validate: run schema + structure validation without saving. */
    async postAuthorValidate(lesson: unknown): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
      return post<{ valid: boolean; errors: string[]; warnings: string[] }>('api/author/validate', lesson);
    },

    /** POST /api/author/preview (E4): compile lesson and return IR + sidecar for preview. */
    async postAuthorPreview(lesson: unknown): Promise<{ ir: unknown; sidecar: unknown }> {
      return post<{ ir: unknown; sidecar: unknown }>('api/author/preview', lesson);
    },

    /** POST /api/author/save (S1): validate + write lesson YAML to hub storage. */
    async postAuthorSave(lesson: unknown): Promise<{ ok: boolean; slug: string; path: string; warnings: string[] }> {
      return post<{ ok: boolean; slug: string; path: string; warnings: string[] }>('api/author/save', lesson);
    },

    /** Planned: GET /api/governance/report. Throws if endpoint not implemented. */
    async getGovernanceReport(): Promise<GovernanceReport> {
      return get<GovernanceReport>('api/governance/report');
    },

    /** Planned: GET /api/governance/policy. Throws if endpoint not implemented. */
    async getGovernancePolicy(): Promise<unknown> {
      return get<unknown>('api/governance/policy');
    },

    /** POST /api/governance/compliance. */
    async postGovernanceCompliance(sidecar: LessonSidecar): Promise<ComplianceResult> {
      return post<ComplianceResult>('api/governance/compliance', sidecar);
    },

    /** PUT /api/governance/policy (configuration wizard G1). */
    async putGovernancePolicy(policy: unknown): Promise<{ ok: boolean }> {
      return put<{ ok: boolean }>('api/governance/policy', policy);
    },

    /** GET /api/governance/utu-constants (U4: Spine picker, Protocol reference). */
    async getUtuConstants(): Promise<UtuConstants> {
      return get<UtuConstants>('api/governance/utu-constants');
    },

    /** GET /api/governance/catalog (configuration wizard G2, G4). */
    async getGovernanceCatalog(): Promise<ApprovedCatalog> {
      return get<ApprovedCatalog>('api/governance/catalog');
    },

    /** POST /api/governance/catalog (configuration wizard G2). */
    async postGovernanceCatalog(body: CatalogUpdateBody): Promise<{ ok: boolean; catalog: ApprovedCatalog }> {
      return post<{ ok: boolean; catalog: ApprovedCatalog }>('api/governance/catalog', body);
    },

    /** POST /api/governance/catalog/import (configuration wizard G3). */
    async postGovernanceCatalogImport(body: CatalogImportBody): Promise<{ ok: boolean; catalog: ApprovedCatalog }> {
      return post<{ ok: boolean; catalog: ApprovedCatalog }>('api/governance/catalog/import', body);
    },

    /** GET /api/admin/onboarding-status (A3: first-run detection). */
    async getOnboardingStatus(): Promise<{ isFirstRun: boolean }> {
      return get<{ isFirstRun: boolean }>('api/admin/onboarding-status');
    },

    /** GET /api/admin/config (A1: Hub setup wizard). */
    async getAdminConfig(): Promise<HubConfig> {
      return get<HubConfig>('api/admin/config');
    },

    /** POST /api/admin/sync-test (F2: test sync transport connection). */
    async postSyncTest(body: { transport?: string; homeUrl?: string; usbPath?: string }): Promise<{ ok: boolean; message?: string }> {
      return post<{ ok: boolean; message?: string }>('api/admin/sync-test', body);
    },

    /** PUT /api/admin/config (A1: Hub setup wizard). */
    async putAdminConfig(config: HubConfig): Promise<{ ok: boolean; message?: string }> {
      return put<{ ok: boolean; message?: string }>('api/admin/config', config);
    }
  };
}

export interface HubConfig {
  dataDir?: string;
  serveDir?: string;
  thetaPort?: number;
  approvedCatalog?: string;
  minLocalSample?: number;
  minLocalEdges?: number;
  yamlDir?: string;
  factoryDir?: string;
  katexDir?: string;
  servePort?: number;
  cacheMax?: number;
  hubId?: string;
  homeUrl?: string;
  usbPath?: string;
  sentryPort?: number;
  syncTransport?: string;
}

export type HubApi = ReturnType<typeof createHubApi>;

// ─── Runtime hub URL (T4: Teacher can point portal at hub and verify) ─────────

function getInitialHubUrl(): string {
  if (typeof localStorage === 'undefined') return '';
  const stored = localStorage.getItem('agni_hub_url');
  if (stored !== null && stored !== '') return stored;
  const env = typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_HUB_URL?: string } }).env?.VITE_HUB_URL;
  return env || '';
}

/** Hub URL store. Update via setHubUrl(); persists to localStorage. */
export const hubUrlStore = writable(getInitialHubUrl());

/** Hub API instance, reactive to hubUrlStore. Use $hubApiStore in components. */
export const hubApiStore = derived(hubUrlStore, (url) => createHubApi(url || ''));

/** Set hub URL (persists to localStorage). Call after user saves in Settings. */
export function setHubUrl(url: string): void {
  const trimmed = url.trim();
  if (typeof localStorage !== 'undefined') {
    if (trimmed) localStorage.setItem('agni_hub_url', trimmed);
    else localStorage.removeItem('agni_hub_url');
  }
  hubUrlStore.set(trimmed);
}

/** Test connection to hub. Uses given url or current hubUrlStore. Returns { ok, message }. */
export async function testConnection(url?: string): Promise<{ ok: boolean; message?: string }> {
  const base = url?.trim() || '';
  if (!base) return { ok: false, message: 'No hub URL provided.' };
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  try {
    const res = await fetch(`${normalized}/api/admin/config`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }
    await res.json();
    return { ok: true, message: 'Connected.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

