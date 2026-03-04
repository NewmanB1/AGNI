/**
 * Lesson archetypes for creator experience: design hints, templates, threshold examples.
 * Loaded from data/archetypes.json at build time. Fallback when hub archetypes API unavailable.
 */

import archetypesData from '../../../data/archetypes.json';

export interface Archetype {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'specialty';
  bandRange: [number, number];
  protocols: number[];
  blooms?: string[];
  modalityWeighting?: Record<string, number>;
  teachingModes?: string[];
  stepPattern?: string[];
  designHints?: {
    opening?: string;
    assessment?: string;
    visual?: string;
    antipatterns?: string;
    accessibility?: string;
  };
  accessibilityPath?: string;
  relatedArchetypes?: string[];
}

const ARCHETYPES = (archetypesData as { archetypes: Archetype[] }).archetypes;

/** Archetype IDs that use hardware_trigger heavily — show threshold syntax help prominently */
const SENSOR_HEAVY_ARCHETYPES = new Set([
  'embodied-discovery', 'motor-apprenticeship', 'embodied-sequencing', 'concrete-transfer',
  'hypothesis-testing', 'sensor-lab', 'narrative-journey', 'peer-collaborative', 'multi-modal-synthesis'
]);

export function getAllArchetypes(): Archetype[] {
  return ARCHETYPES;
}

export function getArchetypeById(id: string): Archetype | null {
  return ARCHETYPES.find((a) => a.id === id) ?? null;
}

export function isSensorHeavyArchetype(archetypeId: string | null): boolean {
  return archetypeId ? SENSOR_HEAVY_ARCHETYPES.has(archetypeId) : false;
}

export function getDesignHints(archetypeId: string | null): Archetype['designHints'] | null {
  const arch = getArchetypeById(archetypeId ?? '');
  return arch?.designHints ?? null;
}

export function getStepPattern(archetypeId: string | null): string[] | null {
  const arch = getArchetypeById(archetypeId ?? '');
  const pattern = arch?.stepPattern;
  if (!pattern || !Array.isArray(pattern)) return null;
  return pattern;
}

/** Filter archetypes by band and/or protocol for fork/template suggestions */
export function filterArchetypesByUtu(
  band?: number,
  protocol?: number
): Archetype[] {
  return ARCHETYPES.filter((a) => {
    if (band != null) {
      if (band < a.bandRange[0] || band > a.bandRange[1]) return false;
    }
    if (protocol != null) {
      if (!a.protocols.includes(protocol)) return false;
    }
    return true;
  });
}

/** Threshold examples by archetype — sensor-heavy archetypes get contextual examples */
export function getThresholdExamples(archetypeId: string | null): string[] {
  const base = [
    'accel.total > 2.5g',
    'freefall > 0.35s',
    'steady > 2s',
    'accel.z > 7.5'
  ];
  const arch = getArchetypeById(archetypeId ?? '');
  if (!arch || !isSensorHeavyArchetype(arch.id)) return base;
  // Add archetype-specific examples
  if (arch.id === 'sensor-lab' || arch.id === 'embodied-discovery') {
    return [...base, 'accel.total > 3g AND steady > 0.3s', 'orientation == flat'];
  }
  if (arch.id === 'motor-apprenticeship' || arch.id === 'embodied-sequencing') {
    return [...base, 'gyro.beta > 45deg', 'accel.total > 2g'];
  }
  if (arch.id === 'hypothesis-testing') {
    return [...base, 'freefall > 0.2s'];
  }
  return base;
}
