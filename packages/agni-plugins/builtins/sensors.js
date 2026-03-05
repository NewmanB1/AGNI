'use strict';

// Built-in sensor descriptors.
// To add a new sensor, add ONE entry here and wire the adapter.

var reg = require('../registry');

// ── Accelerometer (DeviceMotion — linear) ───────────────────────────────────

reg.registerSensor({ id: 'accel.x',         label: 'Accel X (linear)',       unit: 'm/s²', group: 'Accelerometer', desc: 'Linear acceleration along X axis (gravity removed)' });
reg.registerSensor({ id: 'accel.y',         label: 'Accel Y (linear)',       unit: 'm/s²', group: 'Accelerometer', desc: 'Linear acceleration along Y axis (gravity removed)' });
reg.registerSensor({ id: 'accel.z',         label: 'Accel Z (linear)',       unit: 'm/s²', group: 'Accelerometer', desc: 'Linear acceleration along Z axis (gravity removed)' });
reg.registerSensor({ id: 'accel.magnitude', label: 'Accel magnitude',        unit: 'm/s²', group: 'Accelerometer', desc: 'Total linear acceleration magnitude' });

// ── Accelerometer (DeviceMotion — with gravity) ─────────────────────────────

reg.registerSensor({ id: 'accel.total.x',   label: 'Accel+G X',             unit: 'm/s²', group: 'Accelerometer', desc: 'Acceleration along X including gravity' });
reg.registerSensor({ id: 'accel.total.y',   label: 'Accel+G Y',             unit: 'm/s²', group: 'Accelerometer', desc: 'Acceleration along Y including gravity' });
reg.registerSensor({ id: 'accel.total.z',   label: 'Accel+G Z',             unit: 'm/s²', group: 'Accelerometer', desc: 'Acceleration along Z including gravity' });
reg.registerSensor({ id: 'accel.total',     label: 'Accel+G total',         unit: 'm/s²', group: 'Accelerometer', desc: 'Total acceleration magnitude including gravity (~9.8 at rest)' });
reg.registerSensor({ id: 'shake',           label: 'Shake detected',        unit: 'none', group: 'Accelerometer', desc: 'Virtual: 1 when accel.total variance (5-sample window) exceeds ~2.5g' });

// ── Gyroscope (DeviceMotion) ────────────────────────────────────────────────

reg.registerSensor({ id: 'gyro.x',          label: 'Gyro X (alpha)',         unit: '°/s',  group: 'Gyroscope', desc: 'Rotation rate around X axis' });
reg.registerSensor({ id: 'gyro.y',          label: 'Gyro Y (beta)',          unit: '°/s',  group: 'Gyroscope', desc: 'Rotation rate around Y axis' });
reg.registerSensor({ id: 'gyro.z',          label: 'Gyro Z (gamma)',         unit: '°/s',  group: 'Gyroscope', desc: 'Rotation rate around Z axis' });
reg.registerSensor({ id: 'gyro.magnitude',  label: 'Gyro magnitude',         unit: '°/s',  group: 'Gyroscope', desc: 'Total rotation rate' });

// ── Orientation (DeviceOrientation) ─────────────────────────────────────────

reg.registerSensor({ id: 'rotation.alpha',  label: 'Compass heading',        unit: '°',    group: 'Orientation', desc: 'Compass direction 0–360 (0=North)' });
reg.registerSensor({ id: 'rotation.beta',   label: 'Tilt front/back',        unit: '°',    group: 'Orientation', desc: 'Front-back tilt −180 to 180' });
reg.registerSensor({ id: 'rotation.gamma',  label: 'Tilt left/right',        unit: '°',    group: 'Orientation', desc: 'Left-right tilt −90 to 90' });
reg.registerSensor({ id: 'orientation',     label: 'Screen position',        unit: 'none', group: 'Orientation', desc: "Virtual: 'flat'|'portrait'|'landscape' derived from rotation" });

// ── Environment (Phyphox bridge) ────────────────────────────────────────────

reg.registerSensor({ id: 'mag.x',           label: 'Magnetometer X',         unit: 'µT',   group: 'Environment (Phyphox)', desc: 'Magnetic field along X axis' });
reg.registerSensor({ id: 'mag.y',           label: 'Magnetometer Y',         unit: 'µT',   group: 'Environment (Phyphox)', desc: 'Magnetic field along Y axis' });
reg.registerSensor({ id: 'mag.z',           label: 'Magnetometer Z',         unit: 'µT',   group: 'Environment (Phyphox)', desc: 'Magnetic field along Z axis' });
reg.registerSensor({ id: 'mag.magnitude',   label: 'Magnetic field strength', unit: 'µT',   group: 'Environment (Phyphox)', desc: 'Total magnetic field magnitude' });
reg.registerSensor({ id: 'mag.total',       label: 'Magnetic total',         unit: 'µT',   group: 'Environment (Phyphox)', desc: 'Alias for mag.magnitude' });
reg.registerSensor({ id: 'light',           label: 'Light level',            unit: 'lux',  group: 'Environment (Phyphox)', desc: 'Ambient light sensor' });
reg.registerSensor({ id: 'light.ambient',   label: 'Ambient light',          unit: 'lux',  group: 'Environment (Phyphox)', desc: 'Ambient light (alias)' });
reg.registerSensor({ id: 'pressure',        label: 'Barometric pressure',    unit: 'hPa',  group: 'Environment (Phyphox)', desc: 'Atmospheric pressure' });
reg.registerSensor({ id: 'temperature',     label: 'Temperature',            unit: '°C',   group: 'Environment (Phyphox)', desc: 'Ambient temperature' });
reg.registerSensor({ id: 'sound.level',     label: 'Sound level',            unit: 'dB',   group: 'Environment (Phyphox)', desc: 'Sound pressure level' });
