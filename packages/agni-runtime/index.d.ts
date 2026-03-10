/**
 * @agni/runtime — type declarations
 *
 * Node: index.js exports RUNTIME_ROOT and resolve().
 * Browser: IIFE scripts attach to window.AGNI_SHARED, AGNI_SVG, AGNI_GATES, AGNI_A11Y, AGNI_SVG_HELPERS.
 * This file declares both the module export and the global types for TypeScript consumers.
 */

declare global {
  interface Window {
    LESSON_DATA?: unknown;
    DEV_MODE?: boolean;
    AGNI_SHARED?: AgniShared;
    AGNI_SVG?: AgniSvg;
    AGNI_GATES?: AgniGates;
    AGNI_A11Y?: AgniA11y;
    AGNI_SVG_HELPERS?: AgniSvgHelpers;
    AGNI_LOADER?: unknown;
    AGNI_INTEGRITY?: unknown;
    AGNI_NAVIGATOR?: unknown;
    AGNI_HUB?: string;
    AGNI_CSP_NONCE?: string;
    AGNI_EDGE_THETA?: unknown;
    AGNI_FRUSTRATION?: unknown;
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
    OLS_BINARY?: unknown;
    initPlayer?: () => void;
    svgGenerators?: { circle: (props: any) => string; rect: (props: any) => string; line: (props: any) => string };
  }

  /** Minimal shape for shared runtime pub/sub core */
  interface AgniShared {
    subscribeToSensor?(sensorId: string, fn: (value: number, ts: number) => void): () => void;
    publishSensorReading?(sensorId: string, value: number, ts?: number): void;
    lastSensorValues?: Map<string, number>;
    thresholdEvaluator?: {
      compile(expr: string): (values: Record<string, number>) => boolean;
      watch?(opts: { expr: string; onMet: () => void; onTimeout?: () => void; timeoutMs?: number }): () => void;
    };
    log?: (msg: string, ...args: unknown[]) => void | { debug: () => void; warn: (m: unknown) => void; error: (m: unknown) => void };
    registerModule?: (name: string, version: string) => void;
    svg?: AgniSvg;
    fromSpec?: (spec: unknown, container: HTMLElement) => Promise<unknown>;
    destroyStepVisual?: () => void;
    _version?: string;
    device?: { isOldAndroid?: boolean; isLowEnd?: boolean; hasMotionEvents?: boolean; hasOrientationEvents?: boolean };
    sensorBridge?: { isActive?: () => boolean; startSimulation?: (opts: unknown) => void; stopSimulation?: () => void };
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

  /** Minimal shape for SVG helpers */
  interface AgniSvgHelpers {
    el?: (tag: string, attrs: Record<string, string | number>) => SVGElement;
    rootSvg?: (container: HTMLElement, w: number, h: number, opts?: { ariaLabel?: string }) => SVGElement;
    txt?: (s: string, x: number, y: number, opts?: unknown) => SVGElement;
    clamp?: (n: number, min: number, max: number) => number;
    polar?: (r: number, theta: number) => { x: number; y: number };
    assign?: (target: object, ...sources: object[]) => object;
    arcPath?: (cx: number, cy: number, r: number, start: number, end: number) => string;
    g?: (children?: unknown[]) => SVGGElement;
    PALETTE?: string[];
    [key: string]: unknown;
  }
}

export {};
declare module '@agni/runtime' {
  const RUNTIME_ROOT: string;
  function resolve(relativePath: string): string;
}
