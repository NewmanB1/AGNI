/**
 * @agni/services — Type definitions for the top-down API.
 * Re-exported by index.d.ts for consumers who need interface types.
 */

// ─── Common result shapes ────────────────────────────────────────────────────

export interface ServiceError {
  error: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// ─── Accounts service ────────────────────────────────────────────────────────

export interface AccountsService {
  registerCreator(opts: { name: string; email: string; password: string }): Promise<{ id?: string; error?: string }>;
  loginCreator(opts: { email: string; password: string }): Promise<{ token?: string; creatorId?: string; error?: string }>;
  validateSession(token: string): Promise<{ creatorId?: string; id?: string; role?: string; [key: string]: unknown } | null>;
  destroySession(token: string): Promise<{ ok?: boolean; error?: string }>;
  cleanExpiredSessions(): Promise<void>;
  listCreators(): Promise<{ creators?: Array<Record<string, unknown>>; error?: string }>;
  setCreatorApproval(creatorId: string, approved: boolean): Promise<{ ok?: boolean; error?: string }>;
  setCreatorRole(creatorId: string, role: string): Promise<{ ok?: boolean; error?: string }>;
  recordLessonAuthored(creatorId: string, lessonSlug: string): Promise<{ ok?: boolean; error?: string }>;
  createStudent(opts: {
    pseudoId?: string;
    displayName?: string;
    pin?: string;
    createdBy?: string;
  }): Promise<{ student?: Record<string, unknown>; error?: string }>;
  createStudentsBulk(opts: { count: number; createdBy?: string }): Promise<{ students?: Array<Record<string, unknown>>; error?: string }>;
  listStudents(): Promise<{ students?: Array<Record<string, unknown>>; error?: string }>;
  getStudent(pseudoId: string): Promise<{ student?: Record<string, unknown>; error?: string }>;
  updateStudent(pseudoId: string, updates: Record<string, unknown>): Promise<{ student?: Record<string, unknown>; error?: string }>;
  generateTransferToken(pseudoId: string, ttlMs?: number): Promise<{ token?: string; expiresAt?: string; error?: string }>;
  claimTransferToken(token: string): Promise<{ ok?: boolean; pseudoId?: string; displayName?: string; sessionToken?: string; error?: string }>;
  verifyStudentPin(pseudoId: string, pin: string): Promise<{ ok?: boolean; verified?: boolean; sessionToken?: string; error?: string }>;
  createStudentSession(pseudoId: string): Promise<string>;
  validateStudentSession(token: string, opts?: { clientIp?: string; userAgent?: string }): Promise<{ pseudoId: string } | null>;
  migrateLegacyPins(): Promise<{ migrated?: number; legacySha256?: number }>;
  generateCode(len: number): string;
}

/** Factory for accounts service with configurable dataDir. */
export type CreateAccounts = (config?: { dataDir?: string }) => AccountsService;

// ─── Author service ──────────────────────────────────────────────────────────

export interface AuthorService {
  parseAuthorBody(body: string | object): { lessonData?: Record<string, unknown>; error?: string };
  validateForAuthor(lessonData: Record<string, unknown>): ValidationResult;
  previewForAuthor(lessonData: Record<string, unknown>): Promise<{ ir?: Record<string, unknown>; sidecar?: Record<string, unknown>; error?: string }>;
  saveLesson(
    lessonData: Record<string, unknown>,
    yamlDir?: string,
    opts?: { compile?: boolean; checkCollision?: boolean; overwrite?: boolean }
  ): Promise<
    | { ok: true; slug: string; path: string; compiled?: boolean; warnings?: string[]; uri?: string; contentHash?: string; parentHash?: string; irPath?: string; sidecarPath?: string }
    | ServiceError
  >;
  loadLesson(slug: string, yamlDir?: string): { lessonData?: Record<string, unknown>; raw?: string } | ServiceError;
  listSavedLessons(yamlDir?: string): string[];
  deleteLesson(slug: string, yamlDir?: string): { ok?: boolean; deleted?: string[] } | ServiceError;
  slugExists(slug: string, yamlDir?: string): boolean;
  deriveSlug(lessonData: Record<string, unknown>): string;
}

// ─── Governance service ──────────────────────────────────────────────────────

export interface GovernancePolicy {
  utuTargets?: Array<{ class: string; band: number }>;
  allowedTeachingModes?: string[];
  minDifficulty?: number;
  maxDifficulty?: number;
  requireUtu?: boolean;
  requireTeachingMode?: boolean;
  allowedProtocols?: number[];
  minProtocol?: number;
  maxProtocol?: number;
  failureModeHints?: boolean;
  [key: string]: unknown;
}

export interface ComplianceResult {
  status: 'ok' | 'warning' | 'fail';
  issues: string[];
}

export interface GovernanceService {
  loadPolicy(filePath?: string): GovernancePolicy;
  savePolicy(policy: GovernancePolicy, filePath?: string): { ok?: boolean; error?: string };
  evaluateLessonCompliance(sidecar: Record<string, unknown>, policy?: GovernancePolicy): ComplianceResult;
  aggregateCohortCoverage(
    lessonIndex: Record<string, unknown>,
    masterySummary: Record<string, unknown>,
    policy?: GovernancePolicy
  ): Record<string, unknown>;
  validatePolicy(policy: GovernancePolicy): { valid: boolean; errors?: string[] };
  loadCatalog(path?: string): Promise<Record<string, unknown>>;
  updateCatalog(updates: Record<string, unknown>): Promise<{ ok?: boolean }>;
  importCatalog(items: unknown[]): Promise<{ ok?: boolean; imported?: number }>;
  saveCatalog(catalog: Record<string, unknown>, path?: string): Promise<{ ok?: boolean }>;
  validateCatalog(catalog: Record<string, unknown>): { valid: boolean; errors?: string[] };
  lessonPassesUtuTargets(
    lesson: Record<string, unknown>,
    policy?: GovernancePolicy,
    opts?: { utuBandOverrideLessonIds?: string[] | Set<string> }
  ): boolean;
}

// ─── LMS service (Proxy to @agni/engine) ──────────────────────────────────────

export interface LMSService {
  isAvailable(): boolean;
  persistState(): void | Promise<void>;
  getState?(): Record<string, unknown>;
  getRecommendation?(studentId: string, candidateIds: string[], options?: Record<string, unknown>): Promise<string | null>;
  recordObservation?(observation: Record<string, unknown>): Promise<void>;
  [key: string]: unknown;
}

// ─── Lesson-chain service ────────────────────────────────────────────────────

export interface ChainVersion {
  version: number;
  contentHash: string;
  parentHash: string | null;
  creatorId: string | null;
  uri: string | null;
  timestamp: string;
}

export interface LessonChainService {
  computeContentHash(lessonData: Record<string, unknown>): string;
  shortHash(fullHash: string): string;
  buildUri(creatorId: string, slug: string): string;
  buildVersionUri(creatorId: string, slug: string, contentHash: string): string;
  parseUri(uri: string): { creatorId: string; slug: string; versionHash?: string } | null;
  canonicalize(obj: unknown): string;
  loadChain(slug: string): Promise<{ slug: string; versions: ChainVersion[] }>;
  appendVersion(slug: string, entry: Partial<ChainVersion>): Promise<{ ok: boolean; version: number }>;
  getLatestVersion(slug: string): Promise<ChainVersion | null>;
  verifyChain(slug: string): Promise<{ valid: boolean; errors: string[]; versions: number }>;
  verifyContentHash(lessonData: Record<string, unknown>): { valid: boolean; computed: string; claimed: string };
  checkForkPermission(license: string): { allowed: boolean; nonCommercial?: boolean; reason?: string };
  inheritedForkLicense(sourceLicense: string): string | null;
  FORKABLE_LICENSES: Set<string>;
  NON_COMMERCIAL_LICENSES: Set<string>;
}

/** Factory for lesson-chain dir-dependent methods with configurable dataDir. */
export type CreateLessonChain = (config?: { dataDir?: string }) => Pick<
  LessonChainService,
  'loadChain' | 'appendVersion' | 'getLatestVersion' | 'verifyChain'
>;

// ─── Compiler service (re-export from @ols/compiler) ──────────────────────────

export interface CompilerService {
  safeYamlLoad(str: string): unknown;
  buildIRWithSidecar(lessonData: Record<string, unknown>, options?: { dev?: boolean }): Promise<{ ir: Record<string, unknown>; sidecar: Record<string, unknown> }>;
  parseLessonFromString(rawYaml: string): { lessonData?: unknown } | { error: string };
  parseLessonYaml(inputPath: string): { lessonData: unknown; raw: string };
  validateLessonStructure(lessonData: Record<string, unknown>): void;
  runCompilePipeline(rawYaml: string, options?: { dev?: boolean }): Promise<{ ir?: Record<string, unknown>; sidecar?: Record<string, unknown>; error?: string }>;
  compileLessonFromYamlFile(inputPath: string, options?: Record<string, unknown>): Promise<void>;
}

// ─── Lesson-schema service (re-export from @ols/schema) ───────────────────────

export interface LessonSchemaService {
  validateLessonData(lessonData: Record<string, unknown>): ValidationResult;
  validateStructure(lessonData: Record<string, unknown>): void;
  validateWithSchema(lessonData: Record<string, unknown>): { valid: boolean; errors: string[] };
}

// ─── Lesson-assembly (re-export from @ols/compiler) ───────────────────────────

export interface LessonAssemblyService {
  assembleLesson?(opts: Record<string, unknown>): Promise<Record<string, unknown>>;
  [key: string]: unknown;
}
