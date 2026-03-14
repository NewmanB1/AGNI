/**
 * @agni/runtime — type declarations
 *
 * Node: index.js exports RUNTIME_ROOT and resolve().
 * Browser: IIFE scripts attach to window.AGNI_SHARED, AGNI_SVG, AGNI_GATES, AGNI_A11Y, AGNI_SVG_HELPERS.
 * This file declares both the module export and the global types for TypeScript consumers.
 * Runtime uses `global.X` (isomorphic); augment both Window and global.
 */

declare global {
  /** iOS 13+ DeviceMotion permission API (optional) */
  interface DeviceMotionEvent {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  }

  /** Lesson metadata injected by hub-transform; shape varies by lesson */
  interface LessonDataGlobal {
    _devMode?: boolean;
    checkpointExpiryMs?: number;
    phyphoxOrigins?: string[];
    sensorSmoothing?: boolean;
    _hubUrl?: string;
    id?: string;
    meta?: { identifier?: string; title?: string; language?: string; expected_duration?: string; accessibility_mode?: string; [key: string]: unknown };
    steps?: Array<{ id?: string; type?: string; [key: string]: unknown }>;
    requires?: { factories?: Array<{ file: string; version?: string; integrity?: string }> };
    inferredFeatures?: { flags?: { has_sensors?: boolean }; [key: string]: unknown };
    lmsMode?: boolean;
    [key: string]: unknown;
  }

  /** TweetNaCl / nacl for Ed25519 (integrity verification fallback) */
  interface AgniNacl {
    sign?: { detached?: { verify?: (msg: Uint8Array, sig: Uint8Array, pub: Uint8Array) => boolean } };
  }

  interface Window {
    LESSON_DATA?: LessonDataGlobal;
    DEV_MODE?: boolean;
    nacl?: AgniNacl;
    OLS_PUBLIC_KEY?: string;
    AGNI_SHARED?: AgniShared;
    AGNI_SVG?: AgniSvg;
    AGNI_GATES?: AgniGates;
    AGNI_A11Y?: AgniA11y;
    AGNI_SVG_HELPERS?: AgniSvgHelpers;
    AGNI_INTEGRITY?: { verify?: (lesson: LessonDataGlobal) => Promise<boolean> };
    AGNI_NAVIGATOR?: { sortLessons?: (a: unknown, b: unknown, c: unknown) => unknown[]; sortLessonsEnhanced?: (a: unknown, b: unknown, c: unknown) => unknown[]; calculateFeatureAffinity?: (a: unknown, b?: unknown) => unknown; applyTeachingModeFilter?: (a: unknown, b?: unknown) => unknown; [key: string]: unknown };
    AGNI_HUB?: string;
    AGNI_CSP_NONCE?: string;
    AGNI_EDGE_THETA?: { getOrderedPrecachedLessons?: () => Promise<unknown[]> };
    AGNI_FRUSTRATION?: AgniFrustration;
    AGNI_CHECKPOINT?: AgniCheckpoint;
    AGNI_TELEMETRY?: unknown;
    AGNI_I18N?: { t?: (key: string, opts?: Record<string, unknown>) => string; setLanguage?: (lang: string) => void; getLanguage?: () => string; getAvailableLanguages?: () => string[]; addStrings?: (lang: string, strings: Record<string, string>) => void };
    AGNI_NARRATION?: AgniNarration;
    AGNI_COMPLETION?: { render?: (opts: unknown) => void };
    AGNI_HUB_KEY?: string;
    AGNI_LOAD_TIMEOUT?: number;
    AGNI_RETRY_TIMEOUT?: number;
    AGNI_SHARED_LOADED?: boolean;
    OLS_NEXT?: unknown;
    OLS_ROUTE?: unknown;
    OLS_BINARY?: { base64ToBytes?: (b64: string) => Uint8Array; concatBytes?: (...arrays: Uint8Array[]) => Uint8Array };
    AGNI_LOADER?: AgniLoader;
    AGNI_STEP_RENDERERS?: Record<string, (ctx: unknown, step: unknown, container?: HTMLElement) => void>;
    initPlayer?: () => void;
    svgGenerators?: { circle: (props: any) => string; rect: (props: any) => string; line: (props: any) => string };
  }

  /** Minimal shape for shared runtime pub/sub core */
  interface AgniShared {
    subscribeToSensor?(sensorId: string, fn: (value: number, ts: number) => void): () => void;
    publishSensorReading?(reading: { sensorId: string; value: number; timestamp?: number }): void;
    lastSensorValues?: Map<string, number>;
    thresholdEvaluator?: {
      compile(expr: string): (values: Map<string, number>) => boolean;
      watch?(thresholdStr: string, primarySensor: string, onMet: (reading: unknown) => void, opts?: { timeoutMs?: number; onTimeout?: () => void }): () => void;
      describe?: (thresholdStr: string) => string;
      validate?: (thresholdStr: string) => { valid: boolean; error: string | null; description: string | null };
    };
    log?: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
    registerModule?: (name: string, version: string) => void;
    svg?: AgniSvg;
    fromSpec?: (spec: unknown, container: HTMLElement) => Promise<unknown>;
    destroyStepVisual?: () => void;
    _version?: string;
    device?: { isOldAndroid?: boolean; isLowEnd?: boolean; hasMotionEvents?: boolean; hasOrientationEvents?: boolean };
    sensorBridge?: { isActive?: () => boolean; start?: () => Promise<boolean>; stop?: () => void; startSimulation?: (opts: unknown) => void; stopSimulation?: () => void; needsPermissionGesture?: boolean; requestPermission?: () => Promise<boolean>; startPhyphox?: () => void; stopPhyphox?: () => void; registerAdapter?: (adapter: unknown) => void };
    setSafeHtml?: (el: HTMLElement, html: string) => void;
    parseDurationMs?: (str: string) => number;
    registerStepCleanup?: (fn: () => void) => void;
    mountStepVisual?: (container: HTMLElement, spec: unknown) => Promise<unknown>;
    currentStageHandle?: { stage?: { destroy: () => void } };
    clearSensorSubscriptions?: (sensorId?: string) => void;
    loadLessonVibrationPatterns?: (patterns: unknown) => void;
    _urlDevMode?: boolean;
    mathRenderer?: unknown;
    tableRenderer?: unknown;
    formatRemainingAttempts?: (primary: string, remaining: number) => string;
    [key: string]: unknown;
  }

  /** Minimal shape for SVG factory system */
  interface AgniSvg {
    stage?: (container: HTMLElement, opts?: { w?: number; h?: number; background?: string }) => AgniStage;
    fromSpec?: (spec: unknown, container: HTMLElement) => unknown;
    barGraph?: (container: HTMLElement, opts: { data: unknown[]; title?: string; yLabel?: string; w?: number; h?: number }) => void;
    [factoryId: string]: unknown;
  }

  interface AgniStage {
    layer(name: string): SVGElement;
    onTick(fn: (t: number, dt: number) => void): void;
    bindSensor(sensorId: string, fn: (value: number, ts: number) => void): void;
    destroy(): void;
    export?: (format: 'svg' | 'png') => string | Promise<string>;
  }

  /** Frustration detection module */
  interface AgniFrustration {
    getEvents?: () => unknown[];
    getTotalEvents?: () => number;
    trackOutcome?: (passed: boolean, skipped: boolean) => void;
    trackRetry?: () => void;
    shouldShowNudge?: () => boolean;
    showNudge?: (container: HTMLElement, t: (k: string, o?: Record<string, unknown>) => string) => void;
    reset?: () => void;
  }

  /** Checkpoint save/resume module */
  interface AgniCheckpoint {
    save?: (lessonId: string, data: unknown, devMode?: boolean) => void;
    load?: (lessonId: string, devMode?: boolean) => unknown;
    clear?: (lessonId: string, devMode?: boolean) => void;
    sync?: (hubUrl: string, pseudoId: string, lessonId: string, devMode?: boolean) => void;
    loadRemote?: (hubUrl: string, pseudoId: string, lessonId: string, devMode?: boolean) => Promise<unknown>;
  }

  /** Narration / TTS module */
  interface AgniNarration {
    isEnabled?: () => boolean;
    setEnabled?: (enabled: boolean) => void;
    setLang?: (lang: string) => void;
    cancel?: () => void;
    narrateStepEntry?: (stepIndex: number, total: number) => void;
    narrateContent?: (text: string) => void;
    narrateSvgDescription?: (factory: string, desc?: string) => void;
    narrateCompletion?: () => void;
    [key: string]: unknown;
  }

  /** Factory loader (cache-first, hub fetch) */
  interface AgniLoader {
    register?: (name: string, version: string) => void;
    loadDependencies?: (lessonData: LessonDataGlobal) => Promise<void>;
    loadOne?: (dep: { file: string; version?: string; integrity?: string }, timeoutMs?: number) => Promise<void>;
    isAvailable?: (factoryId: string) => boolean;
    listCached?: () => Promise<string[]>;
    evict?: (file: string, version?: string) => Promise<unknown>;
    clearCache?: () => Promise<unknown>;
    retryQueued?: () => void;
    setHubUrl?: (url: string) => void;
    showHubSetup?: () => void;
    hubUrl?: string;
    lastError?: { url: string; message: string; error: Error } | null;
  }

  /** Minimal shape for gate renderer */
  interface AgniGates {
    render?: (opts: unknown) => void;
    evaluate?: (opts: unknown) => boolean;
    resolveDirective?: (directive: string) => string;
    renderQuiz?: (gate: unknown, onResult: (result: 'pass' | 'fail') => void) => void;
    renderManualVerification?: (gate: unknown, onResult: (result: 'pass' | 'fail') => void) => void;
    renderRedirect?: (gate: unknown, lesson: unknown, devMode?: boolean) => void;
    [key: string]: unknown;
  }

  /** Minimal shape for accessibility module */
  interface AgniA11y {
    prefs?: { fontScale: number; highContrast: boolean; reducedMotion: boolean; hapticIntensity: number };
    apply?: () => void;
    addAria?: (el: HTMLElement, role: string, label?: string) => void;
    injectSettingsButton?: (container?: HTMLElement, opts?: unknown) => void;
  }

  /** Minimal shape for SVG helpers (matches svg-helpers.js) */
  interface AgniSvgHelpers {
    el?: (tag: string, attrs: Record<string, string | number>) => SVGElement;
    rootSvg?: (container: HTMLElement, w: number, h: number, opts?: { ariaLabel?: string }) => SVGElement;
    txt?: (content: string | number, attrs: Record<string, string | number>) => SVGElement;
    clamp?: (v: number, min: number, max: number) => number;
    polar?: (cx: number, cy: number, r: number, angleDeg: number) => { x: number; y: number };
    assign?: (target: object, ...sources: object[]) => object;
    arcPath?: (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => string;
    g?: (attrs?: Record<string, string | number>, children?: unknown[]) => SVGGElement;
    PALETTE?: string[];
    [key: string]: unknown;
  }
  /** Augment global (typeof globalThis) for isomorphic runtime */
  var global: typeof globalThis & {
    LESSON_DATA?: LessonDataGlobal;
    OLS_BINARY?: { base64ToBytes?: (b64: string) => Uint8Array; concatBytes?: (...arrays: Uint8Array[]) => Uint8Array };
    DEV_MODE?: boolean;
    AGNI_SHARED?: AgniShared;
    AGNI_SVG?: AgniSvg;
    AGNI_GATES?: AgniGates;
    AGNI_A11Y?: AgniA11y;
    AGNI_SVG_HELPERS?: AgniSvgHelpers;
    AGNI_LOADER?: AgniLoader;
    AGNI_INTEGRITY?: unknown;
    AGNI_NAVIGATOR?: unknown;
    AGNI_STEP_RENDERERS?: Record<string, (ctx: unknown, step: unknown, container?: HTMLElement) => void>;
    AGNI_FRUSTRATION?: AgniFrustration;
    AGNI_CHECKPOINT?: AgniCheckpoint;
    AGNI_TELEMETRY?: unknown;
    AGNI_I18N?: unknown;
    AGNI_NARRATION?: unknown;
    AGNI_COMPLETION?: unknown;
    AGNI_HUB?: string;
    AGNI_LOAD_TIMEOUT?: number;
    AGNI_RETRY_TIMEOUT?: number;
    AGNI_CSP_NONCE?: string;
    AGNI_HUB_KEY?: string;
    [key: string]: unknown;
  };
}

export {};
declare module '@agni/runtime' {
  const RUNTIME_ROOT: string;
  function resolve(relativePath: string): string;
}
