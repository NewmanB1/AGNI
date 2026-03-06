/**
 * @agni/runtime — type declarations
 *
 * Node: index.js exports RUNTIME_ROOT and resolve().
 * Browser: IIFE scripts attach to window.AGNI_SHARED, AGNI_SVG, AGNI_GATES, AGNI_A11Y, AGNI_SVG_HELPERS.
 * This file declares both the module export and the global types for TypeScript consumers.
 */

declare global {
  interface Window {
    AGNI_SHARED?: AgniShared;
    AGNI_SVG?: AgniSvg;
    AGNI_GATES?: AgniGates;
    AGNI_A11Y?: AgniA11y;
    AGNI_SVG_HELPERS?: AgniSvgHelpers;
  }

  /** Minimal shape for shared runtime pub/sub core */
  interface AgniShared {
    subscribeToSensor?(sensorId: string, fn: (value: number, ts: number) => void): () => void;
    publishSensorReading?(sensorId: string, value: number, ts?: number): void;
    lastSensorValues?: Map<string, number>;
    thresholdEvaluator?: { compile(expr: string): (values: Record<string, number>) => boolean };
    log?: (msg: string, ...args: unknown[]) => void;
    registerModule?: (name: string, version: string) => void;
    svg?: AgniSvg;
    fromSpec?: (spec: unknown, container: HTMLElement) => Promise<unknown>;
    destroyStepVisual?: () => void;
    _version?: string;
  }

  /** Minimal shape for SVG factory system */
  interface AgniSvg {
    stage?: (container: HTMLElement, opts?: { w?: number; h?: number }) => AgniStage;
    fromSpec?: (spec: unknown, container: HTMLElement) => unknown;
    [factoryId: string]: unknown;
  }

  interface AgniStage {
    layer(name: string): SVGElement;
    onTick(fn: (t: number, dt: number) => void): void;
    bindSensor(sensorId: string, fn: (value: number, ts: number) => void): void;
    destroy(): void;
    export?: (format: 'svg' | 'png') => string;
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
  }

  /** Minimal shape for SVG helpers */
  interface AgniSvgHelpers {
    el?: (tag: string, attrs: Record<string, string>) => SVGElement;
    rootSvg?: (container: HTMLElement, w: number, h: number, opts?: { ariaLabel?: string }) => SVGElement;
  }
}

export {};
declare module '@agni/runtime' {
  const RUNTIME_ROOT: string;
  function resolve(relativePath: string): string;
}
