/**
 * Typed Hub API client for the AGNI portal.
 * Consume only this and docs/api-contract.md; do not call engine/compiler internals.
 *
 * Set VITE_HUB_URL (e.g. http://localhost:8082) to use the real hub; leave unset to use mock data in the UI.
 */

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

    getThetaGraph(): Promise<GraphWeightsResponse> {
      return get<GraphWeightsResponse>('api/theta/graph');
    },

    /** Phase 3: set or clear teacher recommendation override. */
    setRecommendationOverride(pseudoId: string, lessonId: string | null): Promise<{ ok: boolean; override: string | null }> {
      return post<{ ok: boolean; override: string | null }>('api/theta/override', { pseudoId, lessonId });
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
    }
  };
}

export type HubApi = ReturnType<typeof createHubApi>;

/** Default client: baseUrl from env or empty (caller should use mocks when empty). */
export const hubApi = createHubApi(typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_HUB_URL?: string } }).env?.VITE_HUB_URL || '');
