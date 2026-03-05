// src/runtime/sensor-bridge.js
// AGNI Sensor Bridge  v1.7.1
//
// Connects physical device sensors to AGNI_SHARED.publishSensorReading.
// Handles:
//   - iOS 9–12: DeviceMotion events do not fire until the page has received
//     a user touch interaction. There is no permission API — the gesture
//     requirement is implicit and silent. Without an explicit user gesture,
//     sensor steps will wait forever on a freshly loaded lesson.
//   - iOS 13+: DeviceMotionEvent.requestPermission() must be called from
//     an explicit user gesture handler. A programmatic call silently fails.
//   - DeviceMotion event decomposition into named sensor streams
//   - Old Android (4-6) axis convention and frequency differences
//   - Gyroscope / rotation rate via DeviceMotion
//   - DeviceOrientation (tilt angles)
//   - Phyphox postMessage bridge (when student runs phyphox alongside lesson)
//   - Simulation mode for dev/testing without hardware
//
// Published sensor IDs:
//   accel.x / accel.y / accel.z       — linear acceleration (m/s², no gravity)
//   accel.magnitude                    — √(x²+y²+z²) linear
//   accel.total.x/y/z                  — acceleration including gravity
//   accel.total                        — magnitude including gravity
//   rotation.alpha / .beta / .gamma    — device orientation angles (°)
//   gyro.x / gyro.y / gyro.z           — rotation rate (°/s)
//   gyro.magnitude                     — √(rx²+ry²+rz²) rotation rate
//   orientation                        — virtual: 'flat'|'portrait'|'landscape' (from rotation angles)
//
// All readings: { sensorId, value, timestamp }
//
// Target platform: iOS 9+, Android 4+. No ES6, no arrow functions, no const/let.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;
  if (!S) { console.error('[SENSOR-BRIDGE] AGNI_SHARED not found — load shared-runtime.js first'); return; }

  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);
  var log = S.log;

  // ── State ──────────────────────────────────────────────────────────────────
  var _motionActive       = false;
  var _orientationActive  = false;
  var _motionHandler      = null;
  var _orientationHandler = null;
  var _simInterval        = null;
  var _permissionGranted  = false;

  // Old Android: axes are reported with opposite signs and lower precision
  var IS_OLD_ANDROID = S.device.isOldAndroid;

  // Optional low-pass smoothing for accel.total (STK-2.1). Disabled on low-end to save CPU.
  var _accelSmoothing = true;
  var _accelTotalPrev = null;
  var ALPHA = 0.8;  // smoothing factor: smoothed = alpha*prev + (1-alpha)*raw

  // Shake virtual sensor (STK-2.2): ring buffer, emit 1 when max-min > threshold
  var _accelRing = [];
  var RING_SIZE = 5;
  var SHAKE_THRESHOLD = 2.5 * 9.81;  // m/s² (~2.5g)

  // Detect passive event listener support (Chrome 49+; false on Chrome 44)
  var _supportsPassive = false;
  try {
    var _passiveOpts = Object.defineProperty({}, 'passive', { get: function () { _supportsPassive = true; return true; } });
    global.addEventListener('test', null, _passiveOpts);
    global.removeEventListener('test', null, _passiveOpts);
  } catch (_e) { /* passive not supported */ }


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. needsPermissionGesture
  //
  // Two distinct platform constraints require an explicit labeled button tap
  // before sensors can be activated — do NOT call start() programmatically
  // at lesson load if this flag is true:
  //
  //   iOS 9–12:  DeviceMotion events are silently suppressed until the page
  //              has received a real user touch. There is no API to detect
  //              this — it just never fires. An explicit button tap guarantees
  //              the gesture has occurred before start() is called.
  //
  //   iOS 13+:   DeviceMotionEvent.requestPermission() exists and must be
  //              called from within a user gesture event handler. Calling it
  //              programmatically (e.g. in initPlayer()) silently fails and
  //              the permission dialog never appears.
  //
  // The button must be a discrete labeled element — not a full-screen tap
  // target — so that other UI elements on the same screen cannot accidentally
  // satisfy the gesture requirement.
  //
  // On Android and desktop this is always false; start() can be called freely.
  // ═══════════════════════════════════════════════════════════════════════════

  var needsPermissionGesture = (function () {
    var ua = navigator.userAgent || '';

    // iOS 13+: explicit permission API present
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      return true;
    }

    // iOS 9–12: no permission API, but gesture is still required.
    // Detected via WebKit user agent on a non-desktop platform.
    // iPad on iOS 13+ in desktop mode reports as desktop Safari —
    // that edge case is accepted as a known limitation.
    if (/iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/CriOS/.test(ua)) {
      return true;
    }

    return false;
  }());


  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DeviceMotion — primary accelerometer + gyroscope source
  // ═══════════════════════════════════════════════════════════════════════════

  function _smooth(v, prev) {
    if (prev === null) return v;
    return ALPHA * prev + (1 - ALPHA) * v;
  }

  function _onMotion(e) {
    var now = Date.now();
    var lessonData = global.LESSON_DATA;
    var smoothOpt = lessonData && lessonData.sensorSmoothing;
    var useSmooth = (smoothOpt !== false) && _accelSmoothing && !S.device.isLowEnd;

    // Linear acceleration (gravity subtracted by hardware)
    var lin = e.acceleration;
    if (lin) {
      var lx = (lin.x || 0) * (IS_OLD_ANDROID ? -1 : 1);
      var ly = (lin.y || 0) * (IS_OLD_ANDROID ? -1 : 1);
      var lz = lin.z || 0;
      var lmag = Math.sqrt(lx*lx + ly*ly + lz*lz);
      _pub('accel.x',         lx,   now);
      _pub('accel.y',         ly,   now);
      _pub('accel.z',         lz,   now);
      _pub('accel.magnitude', lmag, now);
    }

    // Acceleration including gravity (raw) — smooth accel.total only (primary for thresholds)
    var grav = e.accelerationIncludingGravity;
    if (grav) {
      var gx = (grav.x || 0) * (IS_OLD_ANDROID ? -1 : 1);
      var gy = (grav.y || 0) * (IS_OLD_ANDROID ? -1 : 1);
      var gz = grav.z || 0;
      var gmag = Math.sqrt(gx*gx + gy*gy + gz*gz);
      if (useSmooth) {
        gmag = _smooth(gmag, _accelTotalPrev);
        _accelTotalPrev = gmag;
      } else {
        _accelTotalPrev = null;
      }
      _pub('accel.total.x', gx,   now);
      _pub('accel.total.y', gy,   now);
      _pub('accel.total.z', gz,   now);
      _pub('accel.total',   gmag, now);
      _accelRing.push(gmag);
      if (_accelRing.length > RING_SIZE) _accelRing.shift();
      var shakeVal = 0;
      if (_accelRing.length >= RING_SIZE) {
        var mn = _accelRing[0], mx = mn;
        for (var i = 1; i < _accelRing.length; i++) {
          if (_accelRing[i] < mn) mn = _accelRing[i];
          if (_accelRing[i] > mx) mx = _accelRing[i];
        }
        if (mx - mn >= SHAKE_THRESHOLD) shakeVal = 1;
      }
      _pub('shake', shakeVal, now);
    }

    // Rotation rate (gyroscope)
    var rot = e.rotationRate;
    if (rot) {
      var rx = rot.alpha || 0;
      var ry = rot.beta  || 0;
      var rz = rot.gamma || 0;
      var rmag = Math.sqrt(rx*rx + ry*ry + rz*rz);
      _pub('gyro.x',         rx,   now);
      _pub('gyro.y',         ry,   now);
      _pub('gyro.z',         rz,   now);
      _pub('gyro.magnitude', rmag, now);
    }

    if (DEV_MODE && S.device.isLowEnd) {
      // Reduced logging on low-end devices to avoid slowing the UI thread
      if (Math.random() < 0.05) {
        log.debug('motion sample accel.total:', (S.lastSensorValues.get('accel.total') || 0).toFixed(2));
      }
    }
  }

  function _onOrientation(e) {
    var now = Date.now();
    var alpha = e.alpha || 0;
    var beta  = e.beta  || 0;
    var gamma = e.gamma || 0;
    _pub('rotation.alpha', alpha, now);
    _pub('rotation.beta',  beta,  now);
    _pub('rotation.gamma', gamma, now);
    var ab = Math.abs(beta);
    var ag = Math.abs(gamma);
    var orient = (ab <= 25 && ag <= 25) ? 'flat' : (ag >= 60 ? 'landscape' : 'portrait');
    _pub('orientation', orient, now);
  }

  function _pub(sensorId, value, timestamp) {
    S.publishSensorReading({ sensorId: sensorId, value: value, timestamp: timestamp });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Permission handling (iOS 13+)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Request device motion permission on iOS 13+.
   * Must be called from a user gesture (button tap etc.).
   * On iOS 9-12 and Android this resolves immediately — the gesture
   * requirement on those platforms is satisfied by the button tap that
   * called start(), not by a permission dialog.
   * @returns {Promise<boolean>}  true if permission granted or not needed
   */
  function requestPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      return DeviceMotionEvent.requestPermission().then(function (state) {
        _permissionGranted = (state === 'granted');
        if (!_permissionGranted) {
          log.warn('DeviceMotion permission denied by user');
        }
        return _permissionGranted;
      }).catch(function (err) {
        log.warn('DeviceMotion permission request failed:', err.message);
        return false;
      });
    }
    // Android / desktop / iOS 9-12 — no permission dialog needed
    _permissionGranted = true;
    return Promise.resolve(true);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Start / stop
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start listening to device sensors.
   * Must be called from within a user gesture handler on iOS (any version) —
   * see needsPermissionGesture above. Safe to call multiple times (idempotent).
   * @returns {Promise<boolean>}  true if hardware listeners attached successfully
   */
  function start() {
    if (_motionActive) return Promise.resolve(true);

    if (!S.device.hasMotionEvents) {
      log.warn('DeviceMotionEvent not available on this device');
      return Promise.resolve(false);
    }

    return requestPermission().then(function (granted) {
      if (!granted) return false;

      _motionHandler = _onMotion;
      global.addEventListener('devicemotion', _motionHandler, _supportsPassive ? { passive: true } : false);
      _motionActive = true;
      log.debug('DeviceMotion listener started' + (IS_OLD_ANDROID ? ' [old-android mode]' : ''));

      // Orientation is best-effort — not all devices support it
      if (S.device.hasOrientationEvents) {
        _orientationHandler = _onOrientation;
        global.addEventListener('deviceorientation', _orientationHandler, _supportsPassive ? { passive: true } : false);
        _orientationActive = true;
      }

      return true;
    });
  }

  /**
   * Stop listening and remove all event listeners.
   * The published sensor data in lastSensorValues is preserved.
   */
  function stop() {
    if (_motionHandler) {
      global.removeEventListener('devicemotion', _motionHandler);
      _motionHandler = null;
      _motionActive  = false;
    }
    if (_orientationHandler) {
      global.removeEventListener('deviceorientation', _orientationHandler);
      _orientationHandler = null;
      _orientationActive  = false;
    }
    log.debug('Sensor bridge stopped');
  }

  /** Whether hardware sensors are currently active */
  function isActive() { return _motionActive; }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Phyphox bridge
  //    When a lesson wants higher-precision or additional sensors not available
  //    via DeviceMotion (e.g. barometer, GPS, proximity), the student can run
  //    phyphox alongside the lesson. Phyphox publishes readings via postMessage.
  //
  //    Phyphox message format:
  //    { type: 'phyphox', sensor: 'acc', x: 1.2, y: -3.4, z: 9.8, t: 1234567890 }
  // ═══════════════════════════════════════════════════════════════════════════

  var _phyphoxActive  = false;
  var _phyphoxHandler = null;

  var PHYPHOX_MAP = {
    'acc': function (d) {
      var now = d.t ? d.t * 1000 : Date.now();
      _pub('accel.x',         d.x || 0, now);
      _pub('accel.y',         d.y || 0, now);
      _pub('accel.z',         d.z || 0, now);
      _pub('accel.magnitude', Math.sqrt((d.x||0)*(d.x||0) + (d.y||0)*(d.y||0) + (d.z||0)*(d.z||0)), now);
    },
    'gyr': function (d) {
      var now = d.t ? d.t * 1000 : Date.now();
      _pub('gyro.x', d.x || 0, now);
      _pub('gyro.y', d.y || 0, now);
      _pub('gyro.z', d.z || 0, now);
    },
    'mag': function (d) {
      var now = d.t ? d.t * 1000 : Date.now();
      _pub('mag.x', d.x || 0, now);
      _pub('mag.y', d.y || 0, now);
      _pub('mag.z', d.z || 0, now);
      _pub('mag.magnitude', Math.sqrt((d.x||0)*(d.x||0) + (d.y||0)*(d.y||0) + (d.z||0)*(d.z||0)), now);
    },
    'light':         function (d) { _pub('light',         d.value || d.lux  || 0, d.t ? d.t*1000 : Date.now()); },
    'pressure':      function (d) { _pub('pressure',      d.value || d.p    || 0, d.t ? d.t*1000 : Date.now()); },
    'temperature':   function (d) { _pub('temperature',   d.value || d.temp || 0, d.t ? d.t*1000 : Date.now()); },
    'sound':         function (d) { _pub('sound.level',   d.value || d.db   || 0, d.t ? d.t*1000 : Date.now()); },
    'sound.level':   function (d) { _pub('sound.level',   d.value || d.db   || 0, d.t ? d.t*1000 : Date.now()); }
  };

  // Origin allowlist for postMessage security [R10 P1.3]
  function _isAllowedOrigin(origin) {
    // Same origin is always allowed
    if (origin === location.origin) return true;
    // 'null' origin comes from file:// sandboxed iframes (offline use)
    if (origin === 'null') return true;
    // Lesson-specified allowlist for phyphox app origins
    var lesson = global.LESSON_DATA;
    if (lesson && lesson.phyphoxOrigins) {
      for (var i = 0; i < lesson.phyphoxOrigins.length; i++) {
        if (origin === lesson.phyphoxOrigins[i]) return true;
      }
    }
    return false;
  }

  function _onPhyphoxMessage(event) {
    try {
      if (!_isAllowedOrigin(event.origin)) return;
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!data || data.type !== 'phyphox') return;
      var handler = PHYPHOX_MAP[data.sensor];
      if (handler) {
        handler(data);
      } else {
        _pub('phyphox.' + data.sensor, data.value || 0, Date.now());
      }
    } catch (e) {
      // Malformed message — ignore silently
    }
  }

  /**
   * Enable the phyphox postMessage bridge.
   * Call once; the bridge stays active until stopPhyphox() or stop().
   */
  function startPhyphox() {
    if (_phyphoxActive) return;
    _phyphoxHandler = _onPhyphoxMessage;
    global.addEventListener('message', _phyphoxHandler);
    _phyphoxActive = true;
    log.debug('Phyphox bridge active');
  }

  function stopPhyphox() {
    if (_phyphoxHandler) {
      global.removeEventListener('message', _phyphoxHandler);
      _phyphoxHandler = null;
      _phyphoxActive  = false;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Simulation mode (dev / test without hardware)
  //    Publishes synthetic readings so factories and the threshold evaluator
  //    can be exercised on a desktop browser without a physical device.
  //
  //    The emulator buttons in player.js call startSimulation() with the
  //    appropriate pattern for the current step — they do NOT call routeStep()
  //    directly, so the full evaluation path is always exercised in dev mode.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start simulation mode.
   * @param {object} [simOpts]
   *   pattern  'still'|'shake'|'freefall'|'tilt'|'custom'  (default 'still')
   *   hz       readings per second (default 20)
   *   fn       custom function(t) → [{ sensorId, value }] array
   */
  function startSimulation(simOpts) {
    if (_simInterval) stopSimulation();
    simOpts  = simOpts || {};
    var hz       = simOpts.hz      || 20;
    var pattern  = simOpts.pattern || 'still';
    var customFn = simOpts.fn;
    var t0       = Date.now();

    _simInterval = setInterval(function () {
      var t   = (Date.now() - t0) / 1000;
      var now = Date.now();
      var readings;

      if (customFn) {
        readings = customFn(t);
      } else if (pattern === 'shake') {
        var shake = 8 * Math.sin(t * 12) + (Math.random() - 0.5) * 2;
        readings = [
          { sensorId: 'accel.x',         value: shake },
          { sensorId: 'accel.y',         value: (Math.random()-0.5)*3 },
          { sensorId: 'accel.z',         value: (Math.random()-0.5)*3 },
          { sensorId: 'accel.magnitude', value: Math.abs(shake) + 1 },
          { sensorId: 'accel.total',     value: Math.sqrt(shake*shake + 9.8*9.8) },
          { sensorId: 'shake',           value: 1 }
        ];
      } else if (pattern === 'freefall') {
        // Oscillate between freefall (near 0) and held (near 9.8)
        var cycle = Math.floor(t / 2) % 2 === 0;
        var val   = cycle ? 0.3 + Math.random()*0.4 : 9.6 + Math.random()*0.4;
        readings = [
          { sensorId: 'accel.total',   value: val },
          { sensorId: 'accel.total.z', value: val }
        ];
      } else if (pattern === 'tilt') {
        var gamma = 30 * Math.sin(t * 0.8);
        var beta  = 15 * Math.cos(t * 0.5);
        var ab = Math.abs(beta);
        var ag = Math.abs(gamma);
        var orient = (ab <= 25 && ag <= 25) ? 'flat' : (ag >= 60 ? 'landscape' : 'portrait');
        readings = [
          { sensorId: 'rotation.gamma', value: gamma },
          { sensorId: 'rotation.beta',  value: beta },
          { sensorId: 'orientation',    value: orient }
        ];
      } else {
        // still — phone sitting flat on a surface, accel.z ≈ 9.8
        readings = [
          { sensorId: 'accel.x',         value: (Math.random()-0.5)*0.1 },
          { sensorId: 'accel.y',         value: (Math.random()-0.5)*0.1 },
          { sensorId: 'accel.z',         value: 9.8 + (Math.random()-0.5)*0.2 },
          { sensorId: 'accel.magnitude', value: 0.06 },
          { sensorId: 'accel.total',     value: 9.81 + (Math.random()-0.5)*0.1 }
        ];
      }

      (readings || []).forEach(function (r) {
        _pub(r.sensorId, r.value, now);
      });
    }, Math.round(1000 / hz));

    log.debug('Simulation started: pattern=' + pattern + ' hz=' + hz);
  }

  function stopSimulation() {
    if (_simInterval) {
      clearInterval(_simInterval);
      _simInterval = null;
      log.debug('Simulation stopped');
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Attach to AGNI_SHARED and register
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Plugin adapter registry ──────────────────────────────────────────────
  var _adapters = [];

  function registerAdapter(adapter) {
    if (!adapter || typeof adapter.start !== 'function') return;
    _adapters.push(adapter);
    if (_active && adapter.start) adapter.start(_pub);
  }

  S.sensorBridge = {
    needsPermissionGesture: needsPermissionGesture,

    start:             function () { start(); _adapters.forEach(function (a) { if (a.start) a.start(_pub); }); },
    stop:              function () { stop();  _adapters.forEach(function (a) { if (a.stop)  a.stop();       }); },
    isActive:          isActive,
    requestPermission: requestPermission,

    startPhyphox:  startPhyphox,
    stopPhyphox:   stopPhyphox,

    startSimulation: startSimulation,
    stopSimulation:  stopSimulation,

    registerAdapter: registerAdapter
  };

  S.registerModule('sensor-bridge', '1.8.0');

  if (DEV_MODE) log.debug('sensor-bridge v1.8.0 loaded');

}(window));
