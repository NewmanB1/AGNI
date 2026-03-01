// src/runtime/sensorTypes.ts

/**
 * Common units and categories (based on Phyphox + typical phone sensors)
 */
export type SensorUnit =
  | 'm/s²'      // acceleration
  | '°/s'       // angular velocity (gyro)
  | '°'         // orientation/angle
  | 'lux'       // light
  | 'dB'        // sound pressure
  | 'μT'        // magnetic field
  | 'hPa'       // air pressure
  | 'm'         // altitude (barometric)
  | 's'         // time
  | 'Hz'        // frequency
  | 'count'     // steps, counts, arbitrary units
  | 'none';     // unitless (e.g. normalized -1..1)

/**
 * Most common single-value or vector sensors
 */
export interface SensorDefinition {
  id: string;                         // unique key, e.g. "accel.x", "gyro.total", "light.ambient"
  displayName: string;                // "Acceleration X", "Total Gyro", "Ambient Light"
  category: 'motion' | 'environment' | 'orientation' | 'audio' | 'other';
  unit: SensorUnit;
  dimensions: 1 | 3;                  // scalar or 3D vector
  typicalRange?: [number, number];    // rough expected min/max (helps auto-scaling graphs)
  samplingHint?: 'fast' | 'medium' | 'slow'; // for UI hints on update frequency
  description?: string;
  phyphoxEquivalent?: string;         // for reference, e.g. "Acceleration with g (x)"
}

/**
 * Live data packet shape coming from DeviceMotion / DeviceOrientation / etc.
 */
export interface SensorReading {
  timestamp: number;                  // ms since page load or monotonic clock
  sensorId: string;
  value: number | [number, number, number];  // scalar or [x,y,z]
  raw?: any;                          // optional full event object for debugging
}

/**
 * A bindable data series that can feed a graph
 */
export interface GraphSeriesSource {
  sensorId: string;                   // which sensor
  component?: 'x' | 'y' | 'z' | 'magnitude' | 'total' | null;  // for vectors
  transform?: string;                 // simple expr e.g. "value * 9.81" or "Math.abs(value)"
  label?: string;
  color?: string;
  // future: smoothing, downsampling, threshold triggers, etc.
}

export const SUPPORTED_SENSORS: SensorDefinition[] = [
  // Motion / IMU
  {
    id: 'accel.x',
    displayName: 'Acceleration X',
    category: 'motion',
    unit: 'm/s²',
    dimensions: 1,
    typicalRange: [-20, 20],
    samplingHint: 'fast',
    phyphoxEquivalent: 'Acceleration with g (x)'
  },
  {
    id: 'accel.magnitude',
    displayName: 'Acceleration Magnitude',
    category: 'motion',
    unit: 'm/s²',
    dimensions: 1,
    typicalRange: [0, 25],
    samplingHint: 'fast'
  },
  {
    id: 'gyro.x',
    displayName: 'Gyroscope X',
    category: 'motion',
    unit: '°/s',
    dimensions: 1,
    typicalRange: [-300, 300],
    samplingHint: 'fast'
  },
  {
    id: 'orientation.beta',
    displayName: 'Device Tilt (β)',
    category: 'orientation',
    unit: '°',
    dimensions: 1,
    typicalRange: [-180, 180],
    samplingHint: 'medium'
  },
  // Environment
  {
    id: 'light.ambient',
    displayName: 'Ambient Light',
    category: 'environment',
    unit: 'lux',
    dimensions: 1,
    typicalRange: [0, 100000],
    samplingHint: 'slow'
  },
  {
    id: 'sound.level',
    displayName: 'Sound Pressure Level',
    category: 'audio',
    unit: 'dB',
    dimensions: 1,
    typicalRange: [0, 120],
    samplingHint: 'medium'
  },
  {
    id: 'mag.total',
    displayName: 'Magnetic Field Strength',
    category: 'environment',
    unit: 'μT',
    dimensions: 1,
    typicalRange: [0, 200],
    samplingHint: 'medium'
  }
];
