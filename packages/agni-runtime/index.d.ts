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
    [key: string]: unknown;
  }

  interface Window {
    LESSON_DATA?: LessonDataGlobal;
    DEV_MODE?: boolean;
    AGNI_SHARED?: AgniShared;
    AGNI_SVG?: AgniSvg;
    AGNI_GATES?: AgniGates;
    AGNI_A11Y?: AgniA11y;
    AGNI_SVG_HELPERS?: AgniSvgHelpers;
    AGNI_INTEGRITY?: unknown;
    AGNI_NAVIGATOR?: { sortLessons?: (a: unknown, b: unknown, c: unknown) => unknown[]; sortLessonsEnhanced?: (a: unknown, b: unknown, c: unknown) => unknown[]; calculateFeatureAffinity?: (a: unknown, b?: unknown) => unknown; applyTeachingModeFilter?: (a: unknown, b?: unknown) => unknown; [key: string]: unknown };
    AGNI_HUB?: string;
    AGNI_CSP_NONCE?: string;
    AGNI_EDGE_THETA?: { getOrderedPrecachedLessons?: () => Promise<unknown[]> };
    AGNI_FRUSTRATION?: { getEvents?: () => unknown[]; getTotalEvents?: () => number };
    AGNI_CHECKPOINT?: unknown;
    AGNI_TELEMETRY?: unknown;
    AGNI_I18N?: unknown;
    AGNI_NARRATION?: unknown;
    AGNI_COMPLETION?: unknown;
    AGNI_HUB_KEY?: string;
    AGNI_LOAD_TIMEOUT?: number;
    AGNI_RETRY_TIMEOUT?: number;
    AGNI_SHARED_LOADED?: boolean;
    OLS_NEXT?: unknown;
    OLS_ROUTE?: unknown;
    OLS_BINARY?: { base64ToBytes?: (b64: string) => Uint8Array; concatBytes?: (...arrays: Uint8Array[]) => Uint8Array };
    AGNI_LOADER?: { register?: (name: string, version: string) => void };
    AGNI_STEP_RENDERERS?: Record<string, (ctx: unknown, step: unknown, container: HTMLElement) => void>;
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
    mountStepVisual?: (container: HTMLElement, spec: unknown) => unknown;
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

  /** Minimal shape for gate renderer */
  interface AgniGates {
    render?: (opts: unknown) => void;
    evaluate?: (opts: unknown) => boolean;
    [key: string]: unknown;
  }

  /** Minimal shape for accessibility module */
  interface AgniA11y {
    prefs?: { fontScale: number; highContrast: boolean; reducedMotion: boolean; hapticIntensity: number };
    apply?: () => void;
    addAria?: (el: HTMLElement, role: string, label: string) => void;
    injectSettingsButton?: (container: HTMLElement, opts?: unknown) => void;
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
    AGNI_LOADER?: { register?: (name: string, version: string) => void };
    AGNI_INTEGRITY?: unknown;
    AGNI_NAVIGATOR?: unknown;
    AGNI_STEP_RENDERERS?: Record<string, (ctx: unknown, step: unknown, container: HTMLElement) => void>;
    AGNI_FRUSTRATION?: unknown;
    AGNI_CHECKPOINT?: unknown;
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
